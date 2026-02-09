// TRANSITIONAL: Second Look route currently composes run_analysis (v3 stack) + second_look_v2 artifact assembly.
// Target end state is direct v4 kernel orchestration once migration is complete.
import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getStore } from "@/src/lib/intelligence/store";
import { runAnalysisFromPack } from "@/src/lib/intelligence/run_analysis";
import type { DataPackStats, DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";
import { RunLogger } from "@/src/lib/intelligence/run_logger";
import { acquireRunLock, releaseRunLock } from "@/src/lib/intelligence/run_lock";
import {
  parseSecondLookIntakeV2,
  validateSecondLookIntakeV2,
} from "@/src/lib/second_look_v2/contracts/second_look_intake_v2";

type SecondLookRequestBody = {
  intake?: unknown;
  source_run_id?: string;
  pack_id?: string;
  website_url?: string | null;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  let body: SecondLookRequestBody;
  try {
    body = (await request.json()) as SecondLookRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateSecondLookIntakeV2(body.intake);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, message: "Invalid Second Look intake.", errors: validation.errors },
      { status: 400 }
    );
  }

  const intake = parseSecondLookIntakeV2(body.intake);
  if (!intake.consent_flags.data_ok) {
    return NextResponse.json(
      { ok: false, message: "Consent flag data_ok must be true to generate artifact." },
      { status: 400 }
    );
  }

  const packIdFromBody = asString(body.pack_id);
  const sourceRunId = asString(body.source_run_id);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const actor = user
    ? { id: user.id, email: user.email }
    : { id: "local-dev-user", email: null };

  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser(actor.id, actor.email);

  let sourceRun = null;
  if (sourceRunId) {
    sourceRun = await store.getRun(sourceRunId);
    if (!sourceRun) {
      return NextResponse.json({ ok: false, message: "source_run_id not found." }, { status: 404 });
    }
    if (sourceRun.workspace_id !== workspace.id) {
      return NextResponse.json({ ok: false, message: "Not allowed." }, { status: 403 });
    }
  }

  const packId = packIdFromBody ?? sourceRun?.pack_id ?? undefined;
  if (!packId) {
    return NextResponse.json(
      { ok: false, message: "Provide pack_id or source_run_id with a pack." },
      { status: 400 }
    );
  }

  const pack = await store.getDataPack(packId);
  if (!pack) {
    return NextResponse.json({ ok: false, message: "Pack not found." }, { status: 404 });
  }
  if (pack.workspace_id !== workspace.id) {
    return NextResponse.json({ ok: false, message: "Not allowed." }, { status: 403 });
  }

  const lockResult = await acquireRunLock(workspace.id, actor.id, 300);
  if (!lockResult.acquired) {
    return NextResponse.json({ ok: false, message: lockResult.message ?? "Could not acquire run lock." }, { status: 409 });
  }

  const websiteUrl = asNullableString(body.website_url) ?? sourceRun?.website_url ?? null;
  const run_id = crypto.randomUUID();
  const logger = new RunLogger(run_id);

  await store.createRun({
    run_id,
    workspace_id: workspace.id,
    pack_id: pack.id,
    status: "running",
    mode: (process.env.INTELLIGENCE_MODE ?? "mock").toLowerCase(),
    website_url: websiteUrl,
  });

  try {
    const result = await runAnalysisFromPack({
      run_id,
      pack: pack.normalized_json as DataPackV0,
      pack_stats: pack.stats_json as DataPackStats,
      website_url: websiteUrl,
      workspace_id: workspace.id,
      lock_id: lockResult.lock_id,
      second_look_intake_v2: intake,
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
        second_look_artifact_v2: result.second_look_artifact_v2 ?? null,
      },
      business_profile_json: result.business_profile,
      error: result.validation.ok ? null : result.validation.errors.join("; "),
    });

    return NextResponse.json({
      ok: true,
      run_id,
      result_url: `/second-look?run_id=${run_id}`,
      second_look_artifact_v2: result.second_look_artifact_v2 ?? null,
    });
  } catch (error) {
    logger.logEvent("second_look_generation_failed", { error: RunLogger.serializeError(error) });

    await store.updateRun(run_id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Second Look generation failed." },
      { status: 500 }
    );
  } finally {
    if (lockResult.lock_id) {
      await releaseRunLock(lockResult.lock_id);
    }
  }
}
