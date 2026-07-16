export type Severity = "critical" | "high" | "medium" | "low" | "pass" | "notice";
export type Category = "Technical" | "On-page" | "Performance" | "Mobile UX" | "Accessibility" | "Indexing" | "Trust";
export type Finding = { id: string; category: Category; severity: Severity; title: string; affectedUrl: string; why: string; evidence: string; fix: string; searchImpact: string; verify: string; points: number; };
export type Redirect = { status: number; url: string; target?: string; type: string; };
export type AuditReport = {
  id: string; targetUrl: string; finalUrl: string; status: number; score: number; indexability: "Indexable" | "Needs attention" | "Blocked";
  auditedAt: string; durationMs: number; title: string | null; description: string | null; canonical: string | null; robots: string | null; language: string | null; wordCount: number;
  categoryScores: Record<Category, number>; findings: Finding[]; redirects: Redirect[]; screenshots: { desktop?: string; mobile?: string }; rawVsRendered: { changed: boolean; details: string[] }; checksNotRun: string[];
};

export type CrawlPage = {
  url: string; finalUrl?: string; status?: number; title?: string | null; description?: string | null; h1?: string | null; canonical?: string | null;
  robots?: string | null; wordCount?: number; internalLinks: number; externalLinks: number; images: number; redirects: Redirect[]; indexability: "Indexable" | "Blocked" | "Needs attention" | "Not checked";
  extractedText?: string; error?: string; robotsAllowed: boolean;
};

export type CrawlReport = {
  id: string; targetUrl: string; domain: string; crawledAt: string; durationMs: number; limit: number; pages: CrawlPage[];
  discovered: number; blockedByRobots: number; broken: number; duplicateTitles: string[][]; duplicateDescriptions: string[][]; duplicateH1s: string[][]; errors: string[]; notes: string[];
};
