import { chromium } from "playwright";
import { assertPublicUrl, normalizeUrl } from "./security";
import type { CrawlPage, CrawlReport, Redirect } from "./types";

const agent = "SEOvuxBot/1.0 (+https://seovux.example/bot; public-site-crawl)";
const pageTimeout = 12_000;
const maxRedirects = 8;
const pause = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

const clean = (value: string) => value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").trim();
const getTag = (html: string, name: string) => new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(html)?.[1] ? clean(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(html)![1]) : null;
const getMeta = (html: string, name: string) => new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)`, "i").exec(html)?.[1] ?? new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, "i").exec(html)?.[1] ?? null;
const getCanonical = (html: string) => new RegExp(`<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']*)`, "i").exec(html)?.[1] ?? null;
const wordCount = (html: string) => clean(html).split(" ").filter(Boolean).length;

type RobotsRule = { allow: boolean; path: string };
type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

function robotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const split = line.indexOf(":");
    if (split < 1) continue;
    const field = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();
    if (field === "user-agent") {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current && value) {
      current.rules.push({ allow: field === "allow", path: value });
    }
  }
  return groups;
}

function patternMatches(pathname: string, pattern: string) {
  const expression = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\$$/, "$");
  return new RegExp(`^${expression}`).test(pathname);
}

/** Returns whether SEOvux may request this path under robots.txt. */
export function robotsAllows(text: string, pathname: string, crawler = "seovuxbot") {
  const groups = robotsGroups(text);
  const matched = groups.filter(group => group.agents.some(name => name === crawler || name === "*"));
  const specific = matched.filter(group => group.agents.some(name => name === crawler));
  const rules = (specific.length ? specific : matched).flatMap(group => group.rules);
  let winner: RobotsRule | undefined;
  for (const rule of rules) {
    if (!patternMatches(pathname, rule.path)) continue;
    if (!winner || rule.path.length > winner.path.length || (rule.path.length === winner.path.length && rule.allow)) winner = rule;
  }
  return !winner || winner.allow;
}

async function loadRobots(origin: URL) {
  const robotsUrl = new URL("/robots.txt", origin);
  await assertPublicUrl(robotsUrl);
  const response = await fetch(robotsUrl, { headers: { "user-agent": agent, accept: "text/plain,*/*;q=0.1" }, signal: AbortSignal.timeout(8_000) });
  if (response.status === 404 || response.status === 410) return { text: "", note: `robots.txt returned ${response.status}; no crawl rules were supplied.` };
  if (!response.ok) throw new Error(`robots.txt returned HTTP ${response.status}. Crawl stopped to avoid ignoring the site's crawl policy.`);
  return { text: await response.text(), note: "robots.txt was read before crawling." };
}

async function fetchHtml(start: URL) {
  let current = start;
  const redirects: Redirect[] = [];
  for (let hop = 0; hop < maxRedirects; hop++) {
    await assertPublicUrl(current);
    const response = await fetch(current, { redirect: "manual", headers: { "user-agent": agent, accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(pageTimeout) });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const target = new URL(location, current);
      redirects.push({ status: response.status, url: current.toString(), target: target.toString(), type: response.status === 301 || response.status === 308 ? "permanent" : "temporary" });
      current = target;
      continue;
    }
    redirects.push({ status: response.status, url: current.toString(), type: "final" });
    const contentType = response.headers.get("content-type") ?? "";
    return { response, current, redirects, html: contentType.includes("html") ? await response.text() : "", contentType };
  }
  throw new Error(`Redirect limit exceeded (${maxRedirects} hops).`);
}

function internalUrls(html: string, base: URL, host: string) {
  const links: URL[] = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const link = new URL(match[1], base);
      link.hash = "";
      if ((link.protocol === "http:" || link.protocol === "https:") && link.hostname.toLowerCase() === host) links.push(link);
    } catch { /* Ignore malformed href values. */ }
  }
  return links;
}

function normalizePage(url: URL) {
  const copy = new URL(url);
  copy.hash = "";
  if (copy.pathname !== "/" && copy.pathname.endsWith("/")) copy.pathname = copy.pathname.slice(0, -1);
  return copy.toString();
}

function duplicates(pages: CrawlPage[], field: "title" | "description" | "h1") {
  const groups = new Map<string, string[]>();
  for (const page of pages) {
    const value = page[field]?.trim();
    if (!value) continue;
    const key = value.toLowerCase().replace(/\s+/g, " ");
    groups.set(key, [...(groups.get(key) ?? []), page.finalUrl ?? page.url]);
  }
  return [...groups.values()].filter(group => group.length > 1);
}

export async function runCrawl(input: string, requestedLimit: number): Promise<CrawlReport> {
  const started = Date.now();
  const start = normalizeUrl(input);
  await assertPublicUrl(start);
  const limit = Math.max(1, Math.min(Math.floor(requestedLimit) || 10, 30));
  const host = start.hostname.toLowerCase();
  const pages: CrawlPage[] = [];
  const errors: string[] = [];
  const notes: string[] = ["Only publicly accessible same-domain HTML pages are crawled. Login walls, CAPTCHAs, paywalls, blocked pages, and non-HTML files are not bypassed."];
  const robots = await loadRobots(start);
  notes.push(robots.note);
  const queue = [normalizePage(start)];
  const known = new Set(queue);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ userAgent: agent, viewport: { width: 1366, height: 768 } });
  } catch (error) {
    notes.push(`JavaScript rendering was unavailable, so pages use the server response only: ${error instanceof Error ? error.message : "browser launch failed"}`);
  }

  while (queue.length && pages.length < limit) {
    const queued = queue.shift()!;
    const candidate = new URL(queued);
    if (!robotsAllows(robots.text, candidate.pathname)) {
      pages.push({ url: queued, internalLinks: 0, externalLinks: 0, images: 0, redirects: [], indexability: "Blocked", error: "Blocked by robots.txt for SEOvuxBot.", robotsAllowed: false });
      continue;
    }
    try {
      const loaded = await fetchHtml(candidate);
      if (loaded.current.hostname.toLowerCase() !== host) {
        pages.push({ url: queued, finalUrl: loaded.current.toString(), status: loaded.response.status, internalLinks: 0, externalLinks: 0, images: 0, redirects: loaded.redirects, indexability: "Needs attention", error: "Redirect leaves the crawl domain; it was recorded but not followed.", robotsAllowed: true });
        continue;
      }
      if (!loaded.html) {
        pages.push({ url: queued, finalUrl: loaded.current.toString(), status: loaded.response.status, internalLinks: 0, externalLinks: 0, images: 0, redirects: loaded.redirects, indexability: loaded.response.status >= 400 ? "Blocked" : "Not checked", error: `Skipped non-HTML response (${loaded.contentType || "unknown content type"}).`, robotsAllowed: true });
        continue;
      }

      let html = loaded.html;
      if (context && loaded.response.ok) {
        const page = await context.newPage();
        try {
          await page.goto(loaded.current.toString(), { waitUntil: "domcontentloaded", timeout: pageTimeout });
          await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
          const renderedUrl = new URL(page.url());
          if (renderedUrl.hostname.toLowerCase() === host) html = await page.content();
          else notes.push(`Rendering stayed on the safe crawl domain for ${loaded.current}; a browser redirect to another domain was not extracted.`);
        } catch (error) {
          errors.push(`Render fallback for ${loaded.current}: ${error instanceof Error ? error.message : "render failed"}`);
        } finally {
          await page.close();
        }
      }

      const discoveredLinks = internalUrls(html, loaded.current, host);
      let externalLinks = 0;
      for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
        try { if (new URL(match[1], loaded.current).hostname.toLowerCase() !== host) externalLinks++; } catch { /* Ignore. */ }
      }
      for (const link of discoveredLinks) {
        const normalized = normalizePage(link);
        if (!known.has(normalized) && known.size < 1_000) { known.add(normalized); queue.push(normalized); }
      }
      const robotsMeta = getMeta(html, "robots");
      const page: CrawlPage = {
        url: queued, finalUrl: loaded.current.toString(), status: loaded.response.status, title: getTag(html, "title"), description: getMeta(html, "description"), h1: getTag(html, "h1"), canonical: getCanonical(html), robots: robotsMeta,
        wordCount: wordCount(html), internalLinks: discoveredLinks.length, externalLinks, images: (html.match(/<img\b/gi) ?? []).length, redirects: loaded.redirects,
        indexability: loaded.response.status >= 400 || /noindex/i.test(robotsMeta ?? "") ? "Blocked" : !getCanonical(html) ? "Needs attention" : "Indexable",
        extractedText: clean(html).slice(0, 20_000), robotsAllowed: true
      };
      pages.push(page);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown crawl error";
      errors.push(`${queued}: ${message}`);
      pages.push({ url: queued, internalLinks: 0, externalLinks: 0, images: 0, redirects: [], indexability: "Not checked", error: message, robotsAllowed: true });
    }
    if (queue.length && pages.length < limit) await pause(350);
  }
  await context?.close();
  await browser?.close();
  const blockedByRobots = pages.filter(page => !page.robotsAllowed).length;
  return { id: crypto.randomUUID().slice(0, 8), targetUrl: start.toString(), domain: host, crawledAt: new Date().toISOString(), durationMs: Date.now() - started, limit, pages, discovered: known.size, blockedByRobots, broken: pages.filter(page => (page.status ?? 0) >= 400).length, duplicateTitles: duplicates(pages, "title"), duplicateDescriptions: duplicates(pages, "description"), duplicateH1s: duplicates(pages, "h1"), errors, notes };
}
