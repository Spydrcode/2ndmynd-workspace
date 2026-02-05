/**
 * Internal API: HF Export
 * 
 * POST /api/internal/hf/export?internal=1
 * 
 * Spawns HF export CLI job in background.
 * Returns job_id for status tracking.
 * 
 * Body:
 *   {
 *     source?: "mock" | "real",
 *     industry?: string,
 *     maxRows?: number,
 *     push?: boolean
 *   }
 * 
 * Response:
 *   {
 *     job_id: string,
 *     status: "started"
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkInternalGuard } from "@/lib/internal/internal_guard";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

interface ExportJobStatus {
  job_id: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at?: string;
  output?: string;
  error?: string;
  bundle_dir?: string;
}

const JOB_STATUS_DIR = "runs/hf_export_jobs";

async function saveJobStatus(status: ExportJobStatus): Promise<void> {
  await fs.mkdir(JOB_STATUS_DIR, { recursive: true });
  const statusPath = path.join(JOB_STATUS_DIR, `${status.job_id}.json`);
  await fs.writeFile(statusPath, JSON.stringify(status, null, 2), "utf-8");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = checkInternalGuard(request);
  
  if (!guard.allowed) {
    return NextResponse.json(
      { error: guard.errorMessage },
      { status: guard.status }
    );
  }
  
  // Parse request body
  let body: {
    source?: "mock" | "real";
    industry?: string;
    maxRows?: number;
    push?: boolean;
  } = {};
  
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  
  const { source, industry, maxRows, push } = body;
  
  // Generate job ID
  const job_id = randomUUID();
  
  // Build CLI args
  const args = ["scripts/hf/export_signals_dataset.ts"];
  if (source) args.push(`--source=${source}`);
  if (industry) args.push(`--industry=${industry}`);
  if (maxRows) args.push(`--max-rows=${maxRows}`);
  if (push) args.push("--push");
  
  const outDir = `runs/hf_export/${job_id}`;
  args.push(`--out-dir=${outDir}`);
  
  // Initialize job status
  const status: ExportJobStatus = {
    job_id,
    status: "running",
    started_at: new Date().toISOString(),
  };
  
  await saveJobStatus(status);
  
  // Spawn CLI in background
  const proc = spawn("tsx", args, {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  
  proc.unref();
  
  let output = "";
  let error = "";
  
  proc.stdout?.on("data", (chunk) => {
    output += chunk.toString();
  });
  
  proc.stderr?.on("data", (chunk) => {
    error += chunk.toString();
  });
  
  proc.on("close", async (code) => {
    const finalStatus: ExportJobStatus = {
      ...status,
      status: code === 0 ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      output: output.slice(0, 10000), // Limit size
      error: error ? error.slice(0, 5000) : undefined,
      bundle_dir: code === 0 ? outDir : undefined,
    };
    
    await saveJobStatus(finalStatus);
  });
  
  return NextResponse.json({
    job_id,
    status: "started",
    message: "HF export job started",
  });
}
