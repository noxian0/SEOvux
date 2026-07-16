const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

let server;
let engineOutput = "";
let updateCheckInProgress = false;
let showNoUpdateMessage = false;
const port = 49321;
const isPackaged = app.isPackaged;
const appRoot = isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");

function appendEngineLog(message) {
  engineOutput = `${engineOutput}${message}`.slice(-4000);
  try { fs.appendFileSync(path.join(app.getPath("userData"), "engine.log"), message); } catch { /* logging must never prevent startup */ }
}
function pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function appendUpdateLog(message) {
  try { fs.appendFileSync(path.join(app.getPath("userData"), "updater.log"), `${new Date().toISOString()} ${message}\n`); } catch { /* update logging must never prevent the app from running */ }
}
function setupUpdates() {
  if (!isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("update-not-available", info => {
    appendUpdateLog(`No update available. Current release: ${info.version}.`);
    updateCheckInProgress = false;
    if (showNoUpdateMessage) dialog.showMessageBox({ type: "info", title: "SEOvux is up to date", message: `You already have the latest version (${info.version}).` });
    showNoUpdateMessage = false;
  });
  autoUpdater.on("update-available", async info => {
    appendUpdateLog(`Update available: ${info.version}.`);
    updateCheckInProgress = false;
    showNoUpdateMessage = false;
    const choice = await dialog.showMessageBox({ type: "info", title: "SEOvux update available", message: `Version ${info.version} is ready to download.`, detail: "Download it now and SEOvux will offer to install it when the download finishes.", buttons: ["Download update", "Later"], defaultId: 0, cancelId: 1 });
    if (choice.response === 0) {
      try { await autoUpdater.downloadUpdate(); } catch (error) { dialog.showErrorBox("Update download failed", error instanceof Error ? error.message : "SEOvux could not download the update."); }
    }
  });
  autoUpdater.on("download-progress", progress => appendUpdateLog(`Download progress: ${Math.round(progress.percent)}%.`));
  autoUpdater.on("update-downloaded", async info => {
    appendUpdateLog(`Update downloaded: ${info.version}.`);
    const choice = await dialog.showMessageBox({ type: "info", title: "Update ready", message: `SEOvux ${info.version} has been downloaded.`, detail: "Restart now to install the update. Your existing installation will be updated in place.", buttons: ["Restart and install", "Later"], defaultId: 0, cancelId: 1 });
    if (choice.response === 0) autoUpdater.quitAndInstall(false, true);
  });
  autoUpdater.on("error", error => {
    appendUpdateLog(`Update error: ${error.message}`);
    updateCheckInProgress = false;
    if (showNoUpdateMessage) dialog.showErrorBox("Update check failed", error.message);
    showNoUpdateMessage = false;
  });
}
async function checkForUpdates(manual = false) {
  if (!isPackaged) {
    if (manual) dialog.showMessageBox({ type: "info", title: "Updates are available in the installed app", message: "Install SEOvux from a GitHub Release to check for updates." });
    return;
  }
  if (updateCheckInProgress) return;
  updateCheckInProgress = true;
  showNoUpdateMessage = manual;
  try { await autoUpdater.checkForUpdates(); } catch (error) {
    updateCheckInProgress = false;
    if (manual) dialog.showErrorBox("Update check failed", error instanceof Error ? error.message : "SEOvux could not check for updates.");
  }
}
function createApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: "SEOvux", submenu: [{ label: "Check for updates...", click: () => checkForUpdates(true) }, { type: "separator" }, { role: "quit" }] }]));
}
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await new Promise(resolve => {
      const request = http.get(`http://127.0.0.1:${port}`, response => { response.resume(); resolve(true); });
      request.once("error", () => resolve(false));
      request.setTimeout(750, () => request.destroy());
    });
    if (ready) return;
    await pause(150);
  }
  throw new Error(`SEOvux's local engine did not start. ${engineOutput || "See engine.log in SEOvux's app-data folder for details."}`);
}
function startServer() {
  const node = isPackaged ? path.join(process.resourcesPath, "node.exe") : process.execPath;
  const args = isPackaged ? [path.join(appRoot, "server.js")] : [path.join(appRoot, "node_modules", "next", "dist", "bin", "next"), "dev"];
  server = spawn(node, args, { cwd: appRoot, windowsHide: true, env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port), NODE_PATH: isPackaged ? path.join(appRoot, "node_modules") : process.env.NODE_PATH, PLAYWRIGHT_BROWSERS_PATH: isPackaged ? path.join(process.resourcesPath, "browsers") : process.env.PLAYWRIGHT_BROWSERS_PATH } });
  server.on("error", error => appendEngineLog(`Spawn error: ${error.message}\n`));
  server.stdout.on("data", data => appendEngineLog(data.toString()));
  server.stderr.on("data", data => appendEngineLog(data.toString()));
  server.on("exit", (code, signal) => appendEngineLog(`Engine exited (code ${code}, signal ${signal}).\n`));
}
async function createWindow() {
  startServer();
  try { await waitForServer(); } catch (error) { dialog.showErrorBox("SEOvux could not start", error.message); app.quit(); return; }
  const window = new BrowserWindow({ width: 1380, height: 900, minWidth: 980, minHeight: 700, title: "SEOvux - Boost Your Rankings, Grow Your Business.", backgroundColor: "#f7f7f2", autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await window.loadURL(`http://127.0.0.1:${port}`);
}
app.whenReady().then(async () => {
  setupUpdates();
  ipcMain.handle("updates:check", () => checkForUpdates(true));
  createApplicationMenu();
  await createWindow();
  if (isPackaged) setTimeout(() => checkForUpdates(false), 5_000);
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { if (server && !server.killed) server.kill(); });
