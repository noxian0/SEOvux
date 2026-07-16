"use client";

import { useState } from "react";
import type { CrawlPage, CrawlReport } from "@/lib/types";

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toCsv(report: CrawlReport) {
  const columns = ["URL", "Final URL", "Status", "Indexability", "Title", "Meta description", "H1", "Canonical", "Robots", "Words", "Internal links", "External links", "Images", "Redirects", "Error", "Extracted text"];
  const rows = report.pages.map(page => [page.url, page.finalUrl, page.status, page.indexability, page.title, page.description, page.h1, page.canonical, page.robots, page.wordCount, page.internalLinks, page.externalLinks, page.images, page.redirects.map(redirect => `${redirect.status} ${redirect.url} ${redirect.target ?? ""}`).join(" | "), page.error, page.extractedText]);
  return [columns, ...rows].map(row => row.map(csvValue).join(",")).join("\r\n");
}

function indexabilityClass(value: CrawlPage["indexability"]) {
  return value === "Indexable" ? "pass" : value === "Blocked" ? "critical" : value === "Needs attention" ? "medium" : "notice";
}

export function CrawlWorkspace({ initialUrl, onUseUrl }: { initialUrl: string; onUseUrl: (url: string) => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [limit, setLimit] = useState(10);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<CrawlReport | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CrawlPage | null>(null);

  const run = async () => {
    setRunning(true);
    setError("");
    setReport(null);
    setSelected(null);
    try {
      const response = await fetch("/api/crawl", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, limit }) });
      const body = await response.text();
      let data: CrawlReport | { error?: string };
      try { data = JSON.parse(body); } catch { throw new Error("The crawl engine returned an unexpected response. Close and reopen SEOvux, then try again."); }
      if (!response.ok) throw new Error("error" in data ? data.error ?? "Crawl could not start" : "Crawl could not start");
      const completed = data as CrawlReport;
      setReport(completed);
      onUseUrl(completed.targetUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected crawl error");
    } finally {
      setRunning(false);
    }
  };

  return <section className="crawl-panel">
    <div className="crawl-intro"><div className="eyebrow">SITE CRAWL + CONTENT EXTRACTOR</div><h2>Map public pages and extract the useful details.</h2><p>SEOvux renders same-domain public pages, respects robots.txt, discovers internal links, and collects metadata and visible text. It does not bypass access controls or scrape private content.</p></div>
    <div className="crawl-controls"><input aria-label="Site URL to crawl" value={url} onChange={event => setUrl(event.target.value)} onKeyDown={event => event.key === "Enter" && !running && run()} placeholder="https://yourwebsite.com" /><label>Pages <select value={limit} onChange={event => setLimit(Number(event.target.value))}>{[5, 10, 15, 20, 30].map(value => <option value={value} key={value}>{value}</option>)}</select></label><button onClick={run} disabled={running}>{running ? "Crawling..." : "Crawl site"}</button></div>
    <div className="crawl-safety"><span>Same domain only</span><span>robots.txt respected</span><span>Rate limited</span><span>Rendered extraction</span></div>
    {error && <p className="error">{error}</p>}
    {running && <div className="crawl-progress"><b>Discovering, rendering and extracting pages...</b><span>This can take a little longer for JavaScript-heavy sites.</span></div>}
    {report && <>
      <div className="crawl-report-head"><div><div className="eyebrow">CRAWL COMPLETE</div><h3>{report.domain}</h3><p>{report.pages.length} of {report.limit} requested pages processed in {(report.durationMs / 1000).toFixed(1)} seconds.</p></div><div className="crawl-exports"><button onClick={() => download(`seovux-crawl-${report.id}.json`, JSON.stringify(report, null, 2), "application/json")}>Export JSON</button><button onClick={() => download(`seovux-crawl-${report.id}.csv`, toCsv(report), "text/csv;charset=utf-8")}>Export CSV</button></div></div>
      <div className="crawl-stats"><article><b>{report.discovered}</b><span>URLs discovered</span></article><article><b>{report.broken}</b><span>Broken pages</span></article><article><b>{report.blockedByRobots}</b><span>Robots blocked</span></article><article><b>{report.duplicateTitles.length + report.duplicateDescriptions.length + report.duplicateH1s.length}</b><span>Duplicate groups</span></article></div>
      <div className="crawl-notes">{report.notes.map(note => <span key={note}>{note}</span>)}</div>
      {(report.duplicateTitles.length > 0 || report.duplicateDescriptions.length > 0 || report.duplicateH1s.length > 0) && <div className="duplicate-summary"><b>Duplicate signals found</b>{report.duplicateTitles.length > 0 && <span>{report.duplicateTitles.length} title group(s)</span>}{report.duplicateDescriptions.length > 0 && <span>{report.duplicateDescriptions.length} description group(s)</span>}{report.duplicateH1s.length > 0 && <span>{report.duplicateH1s.length} H1 group(s)</span>}</div>}
      <div className="crawl-table-wrap"><table className="crawl-table"><thead><tr><th>Page</th><th>Status</th><th>Indexability</th><th>Extracted signals</th><th></th></tr></thead><tbody>{report.pages.map(page => <tr key={page.url}><td><b>{page.finalUrl ? new URL(page.finalUrl).pathname || "/" : new URL(page.url).pathname || "/"}</b><small>{page.title ?? page.error ?? "No title extracted"}</small></td><td>{page.status ?? "-"}</td><td><span className={`severity ${indexabilityClass(page.indexability)}`}>{page.indexability}</span></td><td><small>{page.wordCount ?? 0} words - {page.internalLinks} internal - {page.images} images</small></td><td><button className="inspect-page" onClick={() => setSelected(page)}>Inspect</button></td></tr>)}</tbody></table></div>
      {selected && <section className="extraction-detail"><div className="extraction-head"><div><div className="eyebrow">EXTRACTED PAGE DATA</div><h3>{selected.finalUrl ?? selected.url}</h3></div><button onClick={() => setSelected(null)}>Close</button></div><div className="extraction-grid"><div><b>Title</b><p>{selected.title ?? "Not found"}</p></div><div><b>Meta description</b><p>{selected.description ?? "Not found"}</p></div><div><b>H1</b><p>{selected.h1 ?? "Not found"}</p></div><div><b>Canonical</b><p>{selected.canonical ?? "Not found"}</p></div></div>{selected.error && <p className="crawl-page-error">{selected.error}</p>}<details open><summary>Visible text extracted from the rendered page</summary><pre>{selected.extractedText ?? "No public HTML text was extracted for this page."}</pre></details>{selected.redirects.length > 1 && <details><summary>Redirect path</summary><pre>{selected.redirects.map(item => `${item.status} ${item.url}${item.target ? ` -> ${item.target}` : ""}`).join("\n")}</pre></details>}</section>}
      {report.errors.length > 0 && <details className="crawl-errors"><summary>{report.errors.length} page-level limitation(s)</summary><pre>{report.errors.join("\n")}</pre></details>}
    </>}
  </section>;
}
