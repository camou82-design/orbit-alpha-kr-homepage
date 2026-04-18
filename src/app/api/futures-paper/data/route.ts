import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { loadFuturesPaperDataBundle } from "@/lib/futuresPaperRead";

export const runtime = "nodejs";

/**
 * Read-only JSON bundle for /futures-paper.
 * Uses ORBITALPHA_FUTURES_PAPER_API_URL (Lightsail) or local ORBITALPHA_FUTURES_PAPER_ROOT (dev).
 */
export async function GET() {
  const bundle = await loadFuturesPaperDataBundle();

  // Debug mapping issues in production: distinguish "bundle empty" vs "path mismatch / null fields".
  // Logs go to server console (Vercel function logs).
  try {
    const b: any = bundle as any;
    const missingOrNull: string[] = [];
    const expect = [
      ["engineState", (x: any) => x?.engineState],
      ["summaryRange", (x: any) => x?.summaryRange],
      ["summaryTrend", (x: any) => x?.summaryTrend],
      ["eventsRecent", (x: any) => x?.eventsRecent],
      ["summary.observation.aiApproval", (x: any) => x?.summary?.observation?.aiApproval],
      ["summary.observation.aiBlockQuality", (x: any) => x?.summary?.observation?.aiBlockQuality],
      ["summary.observation.exitMix", (x: any) => x?.summary?.observation?.exitMix]
    ] as const;
    for (const [label, get] of expect) {
      const v = get(b);
      const ok =
        v !== null &&
        v !== undefined &&
        (label === "eventsRecent" ? Array.isArray(v) : typeof v === "object");
      if (!ok) missingOrNull.push(label);
    }
    if (b?.configured && missingOrNull.length > 0) {
      console.warn("[futures-paper] bundle configured but fields missing/null", {
        missingOrNull,
        topKeys: b && typeof b === "object" ? Object.keys(b) : [],
        configured: b?.configured,
        generatedAt: b?.generatedAt
      });
    }
  } catch (e) {
    console.warn("[futures-paper] bundle validation log failed", e);
  }

  return NextResponse.json(bundle);
}
