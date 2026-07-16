"use client";

import { useEffect, useState } from "react";
import { AuditReport } from "@/components/AuditReport";
import { CrawlWorkspace } from "@/components/CrawlWorkspace";
import type { AuditReport as Audit } from "@/lib/types";

declare global { interface Window { seovuxDesktop?: { checkForUpdates: () => Promise<void> } } }

const stages = ["DNS", "Redirects", "HTML", "Render", "Performance", "Analysis", "Report"];
type HistoryItem = Pick<Audit, "id" | "targetUrl" | "finalUrl" | "score" | "indexability" | "auditedAt">;
type View = "audit" | "history" | "crawl" | "about";

export default function Home() {
  const [url, setUrl] = useState("https://example.com");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(-1);
  const [report, setReport] = useState<Audit | null>(null);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<View>("audit");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("seovux-theme");
    const next = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      setHistory(JSON.parse(localStorage.getItem("seovux-history") ?? "[]"));
    } catch {
      localStorage.removeItem("seovux-history");
    }
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("seovux-theme", next ? "dark" : "light");
  };

  const showAudit = () => {
    setView("audit");
    setReport(null);
  };

  const audit = async () => {
    setRunning(true);
    setReport(null);
    setError("");
    setStage(0);
    const timer = window.setInterval(() => setStage(current => Math.min(current + 1, stages.length - 1)), 850);
    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      });
      const body = await response.text();
      let data: Audit | { error?: string };
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error("The audit engine returned an unexpected response. Close and reopen SEOvux, then try again.");
      }
      if (!response.ok) {
        throw new Error("error" in data ? data.error ?? "Audit could not start" : "Audit could not start");
      }
      const completed = data as Audit;
      setReport(completed);
      const item: HistoryItem = {
        id: completed.id,
        targetUrl: completed.targetUrl,
        finalUrl: completed.finalUrl,
        score: completed.score,
        indexability: completed.indexability,
        auditedAt: completed.auditedAt
      };
      setHistory(previous => {
        const next = [item, ...previous.filter(entry => entry.finalUrl !== item.finalUrl)].slice(0, 20);
        localStorage.setItem("seovux-history", JSON.stringify(next));
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected audit error");
    } finally {
      clearInterval(timer);
      setStage(stages.length - 1);
      setRunning(false);
    }
  };

  const sectionName = report ? "Audit report" : view === "history" ? "Audit history" : view === "crawl" ? "Site crawl" : view === "about" ? "About" : "New audit";
  const title = report ? "Audit report" : view === "history" ? "Audit history" : view === "crawl" ? "Site crawl & scraper" : view === "about" ? "About SEOvux" : "Live SEO audit";

  return <main className="desktop-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={showAudit}><span>o</span> SEOvux</a>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={view === "audit" ? "selected" : ""} onClick={showAudit}><span>+</span> New audit</button>
        <button className={view === "history" ? "selected" : ""} onClick={() => { setView("history"); setReport(null); }}><span>H</span> Audit history <i>{history.length || ""}</i></button>
        <button className={view === "crawl" ? "selected" : ""} onClick={() => { setView("crawl"); setReport(null); }}><span>C</span> Site crawl</button>
      </nav>
      <div className="sidebar-bottom">
        <button className={view === "about" ? "about-nav selected" : "about-nav"} onClick={() => { setView("about"); setReport(null); }}><span>i</span> About SEOvux</button>
        <div className="workspace-label">AUDIT PRINCIPLES</div>
        <p>Rendered evidence.<br />Clear priorities.<br /><strong>Make it better today.</strong></p>
        <div className="engine-state"><b>*</b> Local engine ready</div>
      </div>
    </aside>

    <section className="app-panel">
      <header className="app-header">
        <div><div className="crumb">SEOvux / <b>{sectionName}</b></div><h1>{title}</h1></div>
        <div className="header-actions"><button className="theme-button" onClick={toggleTheme} aria-label="Toggle color theme">{dark ? "Light" : "Dark"}</button></div>
      </header>
      <div className="app-content" id="audit">
        {view === "audit" && !report && <section className="audit-workbench">
          <div className="workbench-intro"><div className="eyebrow">RENDERED PAGE INSPECTION</div><h2>Run an evidence-first audit.</h2><p>SEOvux follows redirects, renders JavaScript in Chromium, checks desktop and mobile, then separates things to fix from things already working well.</p></div>
          <div className="auditbar"><input aria-label="Website URL" value={url} onChange={event => setUrl(event.target.value)} onKeyDown={event => event.key === "Enter" && !running && audit()} placeholder="https://yourwebsite.com" /><button onClick={audit} disabled={running}>{running ? "Auditing..." : "Run audit"}</button></div>
          {error && <p className="error">{error}</p>}
          <div className="workbench-notes"><span>Public-target safety checks</span><span>Desktop + mobile render</span><span>Exportable evidence</span></div>
        </section>}

        {running && <section className="progress"><div className="progress-head"><strong>Live audit in progress</strong><span>{stage + 1} / {stages.length}</span></div><div className="stage-list">{stages.map((item, index) => <div className={index <= stage ? "stage active" : "stage"} key={item}><i>{index < stage ? "OK" : index + 1}</i>{item}</div>)}</div><p>Rendering your page in a real browser and collecting verifiable signals.</p></section>}

        {view === "history" && <section className="history-panel">{history.length === 0 ? <div className="empty-history"><b>No completed audits yet.</b><p>Run an audit and it will appear here on this device.</p><button onClick={showAudit}>Run first audit</button></div> : <><div className="history-head"><div><div className="eyebrow">SAVED ON THIS DEVICE</div><h2>Recent audit history</h2></div><button className="clear-history" onClick={() => { localStorage.removeItem("seovux-history"); setHistory([]); }}>Clear history</button></div><div className="history-list">{history.map(item => <article key={item.id}><div className="history-score">{item.score}</div><div><b>{new URL(item.finalUrl).hostname}</b><small>{new Date(item.auditedAt).toLocaleString()} - {item.indexability}</small></div><button onClick={() => { setUrl(item.targetUrl); showAudit(); }}>Run again</button></article>)}</div></>}</section>}

        {view === "crawl" && <CrawlWorkspace initialUrl={url} onUseUrl={setUrl} />}

        {view === "about" && <section className="about-panel">
          <div className="about-intro"><div className="eyebrow">ABOUT THE AUDIT ENGINE</div><h2>Evidence from a real rendered page.</h2><p>SEOvux is a local desktop SEO auditor. It follows the page as a visitor and search crawler would, then explains the signals it found in plain English.</p></div>
          <div className="about-grid">
            <article><div className="about-icon">01</div><h3>What SEOvux checks</h3><p>HTTPS, redirects, status codes, robots rules, canonicals, sitemap signals, headings, titles, descriptions, images, links, structured data, social tags, mobile usability, performance and security headers.</p></article>
            <article><div className="about-icon">02</div><h3>How the audit works</h3><p>It validates the address, checks the redirect path, fetches the page, then renders it with Chromium on desktop and mobile. This captures JavaScript-made content that raw HTML checks can miss.</p></article>
            <article><div className="about-icon">03</div><h3>How scoring works</h3><p>Your 0-100 health score is weighted by category and severity. Critical crawl or indexability problems count more than small polish items. Passed checks are shown too, so you know what to keep.</p></article>
            <article><div className="about-icon">04</div><h3>What the score cannot tell you</h3><p>No audit can promise a Google ranking. Search results also depend on content usefulness, intent, competition, links and Google&apos;s own systems. SEOvux points to evidence-backed improvements, not guarantees.</p></article>
            <article><div className="about-icon">05</div><h3>Safe by design</h3><p>The local engine rejects unsafe addresses, limits audit time and uses controlled browser rendering. If a check cannot run because of a block, login or timeout, the report says so instead of guessing.</p></article>
            <article className="github-card"><div className="about-icon">06</div><h3>Project &amp; updates</h3><p>Follow releases, source updates and share feedback through the official GitHub repository.</p><a href="https://github.com/noxian0/SEOvux" target="_blank" rel="noreferrer">github.com/noxian0/SEOvux</a></article>
            <article className="terms-card"><div className="about-icon">07</div><h3>Use &amp; terms</h3><p>By downloading, installing or using SEOvux, you agree to its Terms of Use and Proprietary License. It may not be modified, redistributed, or included in freemium, subscription or paid products without written permission.</p><span>No ranking outcome is guaranteed.</span></article>
            <article className="update-card"><div className="about-icon">08</div><h3>Keep SEOvux updated</h3><p>SEOvux checks the official GitHub Releases page after startup. When an update is ready, download it and restart to update this installation in place.</p><button onClick={() => { if (window.seovuxDesktop) window.seovuxDesktop.checkForUpdates(); else window.alert("Update checks are available in the installed SEOvux desktop app."); }}>Check for updates</button></article>
          </div>
        </section>}

        {report && <><button className="new-audit" onClick={showAudit}>Start another audit</button><AuditReport report={report} /></>}
      </div>
    </section>
  </main>;
}
