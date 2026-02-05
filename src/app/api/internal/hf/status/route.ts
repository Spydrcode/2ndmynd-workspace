/**
 * Internal API: HF Export Status
 * 
 * GET /api/internal/hf/status?internal=1&job_id=<uuid>
 * 
 * Returns status of HF export job.
 * 
 * Response:
 *   {
 *     job_id: string,
 *     status: "running" | "completed" | "failed",
 *     started_at: string,
 *     completed_at?: string,
 *     output?: string,
 *     error?: string,
 *     bundle_dir?: string
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkInternalGuard } from "@/lib/internal/internal_guard";
import { promises as fs } from "fs";
import path from "path";

const JOB_STATUS_DIR = "runs/hf_export_jobs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = checkInternalGuard(request);
  
  if (!guard.allowed) {
    return NextResponse.json(
      { error: guard.errorMessage },
      { status: guard.status }
    );
  }
  
  const job_id = request.nextUrl.searchParams.get("job_id");
  
  if (!job_id) {
    return NextResponse.json(
      { error: "job_id required" },
      { status: 400 }
    );
  }
  
  const statusPath = path.join(JOB_STATUS_DIR, `${job_id}.json`);
  
  try {
    const content = await fs.readFile(statusPath, "utf-8");
    const status = JSON.parse(content);
    return NextResponse.json(status);
  } catch {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404 }
    );
  }
}
