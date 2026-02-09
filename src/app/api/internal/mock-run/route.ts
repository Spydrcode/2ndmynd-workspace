/**
 * INTERNAL ONLY - Start mock pipeline job
 * LEGACY INTERNAL TOOLING: this route exists for local/mock regression loops.
 * It is not part of the authoritative v4 intelligence kernel.
 * 
 * POST /api/internal/mock-run
 * Body: { industry, seed?, days?, website_url? }
 * 
 * Guardrails:
 * - Blocks in production unless ALLOW_INTERNAL_TESTING=true
 * - Requires internal token in dev or header
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { spawn } from "child_process";
import * as path from "path";
import {
  runMockPipelineJob,
  createFileStatusWriter,
  type MockPipelineParams,
} from "@/src/lib/internal/testing/run_mock_pipeline";

// Guardrails
function isInternalTestingAllowed(req: NextRequest): boolean {
  // Block in production unless explicitly allowed
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_INTERNAL_TESTING !== "true") {
    return false;
  }

  // In non-production, allow without token
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  // Check for internal token
  const token = req.headers.get("x-2ndmynd-internal");
  return token === process.env.INTERNAL_TESTING_TOKEN;
}

export async function POST(req: NextRequest) {
  // Check authorization
  if (!isInternalTestingAllowed(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { industry, seed, days, capture_learning, auto_label, website_url } =
      body as MockPipelineParams;

    // Validate industry
    const validIndustries = ["hvac", "plumbing", "electrical", "landscaping", "cleaning", "random"];
    if (!industry || !validIndustries.includes(industry)) {
      return NextResponse.json(
        { error: "Invalid industry. Must be one of: " + validIndustries.join(", ") },
        { status: 400 }
      );
    }

    // Generate job ID
    const job_id = nanoid();

    // Create status writer
    const statusWriter = createFileStatusWriter(job_id);

    // Start job asynchronously using Node child process
    // This prevents blocking the API response
    const scriptPath = path.join(process.cwd(), "src", "lib", "internal", "testing", "run_job.ts");
    
    // For development, we can also run the job directly (synchronous for now)
    // In production with proper job queue, use spawn for async
    if (process.env.RUN_JOBS_SYNC === "true") {
      // Run synchronously (blocks API response but simpler for dev)
      runMockPipelineJob(
        { industry, seed, days: days ?? 90, capture_learning, auto_label, website_url },
        statusWriter
      ).catch((error: unknown) => {
        console.error("Job error:", error);
      });
    } else {
      // Run async in background (preferred)
      const child = spawn(
        process.platform === "win32" ? "node.exe" : "node",
        [
          "--loader",
          "tsx",
          scriptPath,
          job_id,
          industry,
          String(seed ?? ""),
          String(days ?? 90),
          String(capture_learning ?? false),
          String(auto_label ?? false),
          String(website_url ?? ""),
        ],
        {
          detached: true,
          stdio: "ignore",
          cwd: process.cwd(),
          env: { ...process.env },
        }
      );

      child.unref(); // Allow parent to exit independently
    }

    // Return job info immediately
    return NextResponse.json({
      job_id,
      status_url: `/api/internal/mock-run/status?job_id=${job_id}&internal=1`,
    });
  } catch (error) {
    console.error("Mock run error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
