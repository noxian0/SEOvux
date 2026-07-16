const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("seovuxDesktop", {
  checkForUpdates: () => ipcRenderer.invoke("updates:check")
});
