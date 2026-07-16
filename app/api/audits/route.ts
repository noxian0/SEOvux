import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAudit } from "@/lib/audit";
export const runtime = "nodejs"; export const maxDuration = 60;
const payload = z.object({ url:z.string().min(1).max(2048) });
export async function POST(request: NextRequest) { try { const {url}=payload.parse(await request.json()); return NextResponse.json(await runAudit(url)); } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Invalid request"},{status:400}); } }
