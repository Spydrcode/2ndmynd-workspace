/**
 * Internal API - Learning Dataset Stats
 * 
 * GET /api/internal/learning/dataset
 * 
 * Returns statistics about captured training examples
 */

import { NextRequest, NextResponse } from "next/server";
import { listExamples } from "@/lib/learning/store_jsonl";

function isInternalAllowed(request: NextRequest): { ok: boolean; status: number } {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_INTERNAL_TESTING !== "true") {
    return { ok: false, status: 404 };
  }
  if (process.env.NODE_ENV !== "production") return { ok: true, status: 200 };
  const token = request.headers.get("x-2ndmynd-internal");
  if (!token || token !== process.env.INTERNAL_TESTING_TOKEN) {
    return { ok: false, status: 401 };
  }
  return { ok: true, status: 200 };
}

export async function GET(request: NextRequest) {
  const guard = isInternalAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 404 ? "Not found" : "Unauthorized" }, { status: guard.status });
  }

  try {
    const examples = await listExamples({});
    if (examples.length === 0) {
      return NextResponse.json({
        exists: false,
        total_count: 0,
        mock_count: 0,
        real_count: 0,
      });
    }
    const industries: Record<string, number> = {};
    let mock_count = 0;
    let real_count = 0;
    let labeled_count = 0;
    let earliest_date: string | null = null;
    let latest_date: string | null = null;

    for (const ex of examples) {
      industries[ex.industry_key] = (industries[ex.industry_key] ?? 0) + 1;
      if (ex.source === "mock") mock_count += 1;
      if (ex.source === "real") real_count += 1;
      if (ex.labels) labeled_count += 1;
      if (!earliest_date || ex.created_at < earliest_date) earliest_date = ex.created_at;
      if (!latest_date || ex.created_at > latest_date) latest_date = ex.created_at;
    }

    return NextResponse.json({
      exists: true,
      total_count: examples.length,
      mock_count,
      real_count,
      labeled_count,
      industries,
      earliest_date,
      latest_date,
    });

  } catch (error) {
    console.error("[LEARNING API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get dataset stats" },
      { status: 500 }
    );
  }
}
