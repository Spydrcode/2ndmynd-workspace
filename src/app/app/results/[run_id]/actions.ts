"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getStore } from "@/src/lib/intelligence/store";
import { runAnalysisFromPack } from "@/src/lib/intelligence/run_analysis";
import type { DataPackStats, DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";
import { RunLogger } from "@/lib/intelligence/run_logger";
import { acquireRunLock, releaseRunLock } from "@/src/lib/intelligence/run_lock";

export async function rerunSnapshot(formData: FormData) {
  const packId = String(formData.get("pack_id") ?? "");
  if (!packId) return;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const actor = user
    ? { id: user.id, email: user.email }
    : { id: "local-dev-user", email: null };

  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser(actor.id, actor.email);
  const runCount = await store.countRunsToday(workspace.id);
  if (runCount >= 5) {
    return;
  }

  // Acquire run lock
  const lockResult = await acquireRunLock(workspace.id, actor.id, 300);
  if (!lockResult.acquired) {
    // Silently fail - user can try again
    return;
  }

  const pack = await store.getDataPack(packId);
  if (!pack) return;

  const run_id = crypto.randomUUID();
  const logger = new RunLogger(run_id);

  await store.createRun({
    run_id,
    workspace_id: workspace.id,
    pack_id: pack.id,
    status: "running",
    mode: (process.env.INTELLIGENCE_MODE ?? "mock").toLowerCase(),
    website_url: null,
  });

  try {
    const result = await runAnalysisFromPack({
      run_id,
      pack: pack.normalized_json as DataPackV0,
      pack_stats: pack.stats_json as DataPackStats,
      workspace_id: workspace.id,
      lock_id: lockResult.lock_id,
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
