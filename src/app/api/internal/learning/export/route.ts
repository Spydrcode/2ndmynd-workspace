import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import { exportDataset } from "@/lib/learning/store_jsonl";
import type { DatasetFilters } from "@/lib/learning/types";

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

export async function POST(request: NextRequest) {
  const guard = isInternalAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 404 ? "Not found" : "Unauthorized" }, { status: guard.status });
  }

  try {
    const body = await request.json();
    const filters: DatasetFilters = {};
    if (body?.source) filters.source = body.source;
    if (body?.industry_key) filters.industry_key = body.industry_key;
    if (body?.since) filters.since = body.since;
    const outPath =
      body?.outPath ??
      path.join(process.cwd(), "runs", "learning", `export_${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
    const result = await exportDataset({ outPath, filters });
    return NextResponse.json({ ok: true, outPath: result.outPath, count: result.count });
  } catch (error) {
    console.error("[LEARNING API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export dataset" },
      { status: 500 }
    );
  }
}
