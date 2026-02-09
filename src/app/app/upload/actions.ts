"use server";

import crypto from "node:crypto";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getStore } from "@/src/lib/intelligence/store";
import { storeUploads } from "@/src/lib/intelligence/storage";
import { normalizeUploadBuffersToDataPack } from "@/src/lib/intelligence/pack_normalizer";
import { DataPackStats, DataPackV0, validateDataPackV0 } from "@/src/lib/intelligence/data_pack_v0";
import { runAnalysisFromPack } from "@/src/lib/intelligence/run_analysis";
import { RunLogger } from "@/lib/intelligence/run_logger";
import { acquireRunLock, releaseRunLock } from "@/src/lib/intelligence/run_lock";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const DAILY_RUN_LIMIT = 5;

type UploadState = {
  error?: string;
};

export async function runUploadAction(_: UploadState, formData: FormData): Promise<UploadState> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const actor = user
    ? { id: user.id, email: user.email }
    : { id: "local-dev-user", email: null };

  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser(actor.id, actor.email);
  const runCount = await store.countRunsToday(workspace.id);
  if (runCount >= DAILY_RUN_LIMIT) {
    return { error: "Daily run limit reached. Please try again tomorrow." };
  }

  // Acquire run lock
  const lockResult = await acquireRunLock(workspace.id, actor.id, 300);
  if (!lockResult.acquired) {
    return { error: lockResult.message ?? "Unable to acquire run lock." };
  }

  const sourceTool = String(formData.get("source_tool") ?? "Other");
  const rawWebsite = (formData.get("website_url") as string | null) ?? null;
  const websiteUrl = rawWebsite
    ? rawWebsite.startsWith("http")
      ? rawWebsite
      : `https://${rawWebsite}`
    : null;
  const files = formData.getAll("exports").filter((item) => item instanceof File) as File[];

  if (!files.length) {
    return { error: "Please add at least one export file." };
  }

  let totalBytes = 0;
  const buffers: Array<{ filename: string; buffer: Buffer }> = [];
  for (const file of files) {
    totalBytes += file.size;
    if (file.size > MAX_FILE_BYTES) {
      return { error: `File ${file.name} exceeds 15MB.` };
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { error: "Total upload exceeds 30MB." };
    }
    buffers.push({ filename: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
  }

  let pack: DataPackV0 | undefined;
  let stats: DataPackStats | undefined;
  try {
    const normalized = await normalizeUploadBuffersToDataPack(buffers, sourceTool);
    pack = normalized.pack;
    stats = normalized.stats;
    const validation = validateDataPackV0(pack);
    if (!validation.ok) {
      return { error: `Invalid data pack: ${validation.errors.join(", ")}` };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  if (!pack || !stats) {
    return { error: "Unable to read export files." };
  }

  const run_id = crypto.randomUUID();
  const logger = new RunLogger(run_id);
  logger.logEvent("upload_received", { run_id, files: buffers.length });

  const storage_paths = await storeUploads({
    workspace_id: workspace.id,
    run_id,
    files: buffers,
  });

  const dataPack = await store.createDataPack({
    workspace_id: workspace.id,
    source_tool: sourceTool,
    storage_paths,
    normalized_json: pack,
    stats_json: stats,
  });

  await store.createRun({
    run_id,
    workspace_id: workspace.id,
    pack_id: dataPack.id,
    status: "running",
    mode: (process.env.INTELLIGENCE_MODE ?? "mock").toLowerCase(),
    website_url: websiteUrl,
  });

  try {
    const result = await runAnalysisFromPack({
      run_id,
      pack,
      pack_stats: stats,
      website_url: websiteUrl,
      workspace_id: workspace.id,
      lock_id: lockResult.lock_id,
      ctx: { learning_source: "real" },
    });
    await store.updateRun(run_id, {
      status: result.validation.ok ? "succeeded" : "failed",
      input_hash: result.input_hash,
      results_json: {
        run_id,
        snapshot: result.snapshot,
        conclusion: result.conclusion,
        validation: result.validation,
        meta: result.pipeline_meta ?? null,
        input_recognition: result.input_recognition ?? null,
        data_warnings: result.data_warnings ?? [],
        readiness_level: result.readiness_level ?? null,
        diagnose_mode: result.diagnose_mode ?? null,
        predictive_context: result.predictive_context ?? null,
        archetypes: result.archetypes ?? null,
        predictive_watch_list: result.predictive_watch_list ?? null,
        layer_fusion: result.layer_fusion ?? null,
        run_manifest: result.run_manifest,
        decision_artifact: result.decision_artifact ?? null,
        coherence_snapshot: result.coherence_snapshot ?? null,
        presented_coherence_v1: result.presented_coherence_v1 ?? null,
        coherence_drift: result.coherence_drift ?? null,
        intent_overrides: result.intent_overrides ?? null,
      },
      business_profile_json: result.business_profile,
      error: result.validation.ok ? null : result.validation.errors.join("; "),
    });
  } catch (error) {
    logger.logEvent("run_failed", { error: RunLogger.serializeError(error) });
    await store.updateRun(run_id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Always release lock
    if (lockResult.lock_id) {
      await releaseRunLock(lockResult.lock_id);
    }
  }

  redirect(`/app/results/${run_id}`);
}
