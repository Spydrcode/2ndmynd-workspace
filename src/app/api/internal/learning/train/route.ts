/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Internal API - Learning Layer Training
 * 
 * POST /api/internal/learning/train
 * 
 * Triggers model training on captured examples
 */

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { nanoid } from "nanoid";
import { exportDataset } from "@/src/lib/learning/store_jsonl";

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
    const body = await request.json().catch(() => ({}));
    const { source } = body ?? {};

    const modelsDir = path.join(process.cwd(), "models");
    const evalDir = path.join(process.cwd(), "eval_out");
    const jobId = nanoid();
    const jobDir = path.join(process.cwd(), "runs", "_learning_jobs");
    fs.mkdirSync(jobDir, { recursive: true });

    const datasetOutPath = path.join(process.cwd(), "runs", "learning", "exports", `${jobId}.jsonl`);
    const exportResult = await exportDataset({
      outPath: datasetOutPath,
      filters: source ? { source } : {},
    });

    if (exportResult.count < 10) {
      return NextResponse.json(
        { error: `Insufficient training data. Found ${exportResult.count} examples, need at least 10.` },
        { status: 400 }
      );
    }

    const statusPath = path.join(jobDir, `${jobId}.status.json`);
    const initialStatus = {
      job_id: jobId,
      status: "queued",
      model_name: "all",
      source_filter: source ?? "all",
      examples_count: exportResult.count,
      created_at: new Date().toISOString(),
    };
    fs.writeFileSync(statusPath, JSON.stringify(initialStatus, null, 2));

    const scriptPath = path.join(process.cwd(), "packages", "learning", "scripts", "train_all.py");
    const pythonPath = process.env.PYTHON_PATH || "python";

    const child = spawn(
      pythonPath,
      [
        scriptPath,
        "--dataset", datasetOutPath,
        "--models", modelsDir,
        "--eval_out", evalDir,
      ],
      {
        detached: true,
        stdio: "ignore",
      }
    );

    fs.writeFileSync(
      statusPath,
      JSON.stringify(
        {
          ...initialStatus,
          status: "running",
          started_at: new Date().toISOString(),
          pid: child.pid,
        },
        null,
        2
      )
    );

    child.unref();

    child.on("close", (code) => {
      const finalStatus: any = {
        ...initialStatus,
        status: code === 0 ? "done" : "error",
        completed_at: new Date().toISOString(),
        exit_code: code,
      };

      if (code === 0) {
        const summaryPath = path.join(modelsDir, "training_summary.json");
        if (fs.existsSync(summaryPath)) {
          const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
          finalStatus.model_version = summary.models?.pressure_selector?.version;
          finalStatus.metrics = summary.evaluation ?? summary.models;
          if (summary.models) {
            finalStatus.model_versions = {
              pressure_selector: summary.models.pressure_selector?.version,
              boundary_classifier: summary.models.boundary_classifier?.version,
              calibrator: summary.models.calibrator?.version,
            };
          }
          if (summary.evaluation?.report_path) {
            finalStatus.report_path = summary.evaluation.report_path;
          }
        }
      }

      fs.writeFileSync(statusPath, JSON.stringify(finalStatus, null, 2));
    });

    return NextResponse.json({
      job_id: jobId,
      status: "queued",
      model: "all",
      source: source ?? "all",
      examples_count: exportResult.count,
      status_url: `/api/internal/learning/status?job_id=${jobId}`,
    });

  } catch (error) {
    console.error("[LEARNING API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Training failed" },
      { status: 500 }
    );
  }
}
