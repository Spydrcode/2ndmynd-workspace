"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getStore } from "@/src/lib/intelligence/store";
import { runAnalysisFromPack } from "@/src/lib/intelligence/run_analysis";
import { RunLogger } from "@/lib/intelligence/run_logger";

export async function rerunSnapshot(formData: FormData) {
  const packId = String(formData.get("pack_id") ?? "");
  if (!packId) return;

  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser(user.id, user.email);
  const runCount = await store.countRunsToday(workspace.id);
  if (runCount >= 5) {
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
      pack: pack.normalized_json as any,
    });
    await store.updateRun(run_id, {
      status: result.validation.ok ? "succeeded" : "failed",
      input_hash: result.input_hash,
      results_json: {
        run_id,
        snapshot: result.snapshot,
        conclusion: result.conclusion,
        validation: result.validation,
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
  }

  redirect(`/app/results/${run_id}`);
}
