/**
 * Internal API - Learning Job Status
 * 
 * GET /api/internal/learning/status?job_id=xxx
 * 
 * Returns training job status
 */

import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";

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

  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get("job_id");

  if (!jobId) {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }

  const statusPath = path.join(process.cwd(), "runs", "_learning_jobs", `${jobId}.status.json`);

  if (!fs.existsSync(statusPath)) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  return NextResponse.json(status);
}
