import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCrawl } from "@/lib/crawl";

export const runtime = "nodejs";
export const maxDuration = 60;

const payload = z.object({
  url: z.string().min(1).max(2048),
  limit: z.coerce.number().int().min(1).max(30).default(10)
});

export async function POST(request: NextRequest) {
  try {
    const { url, limit } = payload.parse(await request.json());
    return NextResponse.json(await runCrawl(url, limit));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Crawl could not start" }, { status: 400 });
  }
}
