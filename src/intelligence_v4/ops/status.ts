import fs from "node:fs";
import path from "node:path";

import { resolveEvalsDir, resolveFineTuneRunsDir, resolveModelConfigPath, resolveSynthesisDatasetPath, resolveSynthShipRoot } from "./ops_paths";

type EvalReport = {
  totals?: { fixtures: number; passed: number; failed: number };
  generated_at?: string;
};

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function countJsonlRows(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

function latestFile(dir: string, prefix: string, suffix: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .sort((a, b) => b.localeCompare(a));
  if (files.length === 0) return null;
  return path.resolve(dir, files[0]);
}

function latestDir(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const dirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
  if (dirs.length === 0) return null;
  return path.resolve(dir, dirs[0]);
}

function readPinnedModelId(): string | null {
  const cfg = readJson<{ stages?: { synthesis_decision?: { model_id?: string } } }>(resolveModelConfigPath());
  return cfg?.stages?.synthesis_decision?.model_id ?? null;
}

function readPendingReviewCount(): { path: string | null; pending: number } {
  const file = latestFile(path.resolve(process.cwd(), "train", "curation", "review_packs"), "review_pack_", ".json");
  if (!file) return { path: null, pending: 0 };

  const payload = readJson<{ items?: Array<{ approved?: boolean }> }>(file);
  const pending = Array.isArray(payload?.items)
    ? payload.items.filter((item) => item?.approved !== true).length
    : 0;

  return { path: file, pending };
}

function readLastFineTuneJob(): { run_dir: string | null; job_id: string | null; status: string | null } {
  const stageDir = resolveFineTuneRunsDir();
  const latestRun = latestDir(stageDir);
  if (!latestRun) {
    return { run_dir: null, job_id: null, status: null };
  }

  const job = readJson<{ openai?: { job_id?: string; status?: string } }>(path.resolve(latestRun, "job.json"));
  return {
    run_dir: latestRun,
    job_id: job?.openai?.job_id ?? null,
    status: job?.openai?.status ?? null,
  };
}

function readLastEval(): { path: string | null; passed: boolean | null } {
  const reportPath = latestFile(resolveEvalsDir(), "report_", ".json");
  if (!reportPath) {
    return { path: null, passed: null };
  }

  const report = readJson<EvalReport>(reportPath);
  const passed = report?.totals ? report.totals.failed === 0 : null;
  return {
    path: reportPath,
    passed,
  };
}

function readLastShipManifest(): string | null {
  const latestShip = latestDir(resolveSynthShipRoot());
  if (!latestShip) return null;
  const manifestPath = path.resolve(latestShip, "ops_manifest.json");
  return fs.existsSync(manifestPath) ? manifestPath : null;
}

function main() {
  const lastFineTune = readLastFineTuneJob();
  const status = {
    generated_at: new Date().toISOString(),
    approved_synthesis_examples: countJsonlRows(resolveSynthesisDatasetPath()),
    pending_review: readPendingReviewCount(),
    last_finetune_job: lastFineTune,
    pinned_synthesis_model_id: readPinnedModelId(),
    last_eval: readLastEval(),
    last_ship_manifest: readLastShipManifest(),
    fine_tune_visibility_hint: lastFineTune.job_id
      ? null
      : "Run ops:ft:doctor -- --list=true to view jobs",
  };

  console.log(JSON.stringify(status, null, 2));
}

if (process.argv[1]?.includes("status.ts")) {
  main();
}
