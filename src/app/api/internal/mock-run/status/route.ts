/**
 * INTERNAL ONLY - Check mock pipeline job status
 * 
 * GET /api/internal/mock-run/status?job_id=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { readJobStatus } from "@/src/lib/internal/testing/run_mock_pipeline";

// Same guardrails as main route
function isInternalTestingAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_INTERNAL_TESTING !== "true") {
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const token = req.headers.get("x-2ndmynd-internal");
  return token === process.env.INTERNAL_TESTING_TOKEN;
}

export async function GET(req: NextRequest) {
  // Check authorization
  if (!isInternalTestingAllowed(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const searchParams = req.nextUrl.searchParams;
  const job_id = searchParams.get("job_id");

  if (!job_id) {
    return NextResponse.json({ error: "Missing job_id parameter" }, { status: 400 });
  }

  // Read status from file
  const status = readJobStatus(job_id);

  if (!status) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(status);
}
