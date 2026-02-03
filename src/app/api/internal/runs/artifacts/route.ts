import { NextRequest, NextResponse } from "next/server";
import { getRun, buildResultsArtifact } from "@/src/lib/intelligence/run_adapter";
import { buildDecisionArtifact } from "@/lib/present/build_decision_artifact";
import { applyLearningToDecisionArtifact } from "@/lib/learning/infer";
import type { AnalysisResult } from "@/lib/intelligence/run_analysis";
import type { SnapshotV2, ConclusionV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { LayerFusionResult } from "@/lib/intelligence/layer_fusion/types";
import type { BenchmarkResult } from "@/lib/benchmarks/types";
import type { BusinessProfile } from "@/lib/intelligence/web_profile";

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

function buildAnalysisResult(runId: string, artifact: ReturnType<typeof buildResultsArtifact>): AnalysisResult {
  const snapshot = artifact.snapshot as SnapshotV2;
  const conclusion = (artifact.conclusion ?? null) as ConclusionV2 | null;
  const layerFusion = (artifact.layer_fusion ?? null) as LayerFusionResult | null;
  const benchmarks = (artifact.benchmarks ?? null) as BenchmarkResult | null;
  const businessProfile = (artifact.business_profile ?? {}) as BusinessProfile;

  return {
    run_id: runId,
    input_hash: "internal",
    snapshot,
    conclusion,
    validation: artifact.validation ?? { ok: true, errors: [] },
    business_profile: businessProfile,
    input_recognition: artifact.input_recognition ?? undefined,
    data_warnings: artifact.data_warnings ?? [],
    predictive_context: artifact.predictive_context ?? undefined,
    archetypes: artifact.archetypes ?? undefined,
    predictive_watch_list: artifact.predictive_watch_list ?? undefined,
    run_manifest: artifact.run_manifest ?? ({} as AnalysisResult["run_manifest"]),
    readiness_level: artifact.readiness_level ?? undefined,
    diagnose_mode: artifact.diagnose_mode ?? undefined,
    layer_fusion: layerFusion ?? undefined,
    benchmarks: benchmarks ?? undefined,
    mapping_confidence: artifact.mapping_confidence ?? undefined,
    decision_artifact: artifact.decision_artifact ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  const guard = isInternalAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 404 ? "Not found" : "Unauthorized" }, { status: guard.status });
  }
  if (request.nextUrl.searchParams.get("internal") !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const runId = request.nextUrl.searchParams.get("run_id");
  const mode = request.nextUrl.searchParams.get("mode") ?? "baseline";
  if (!runId) {
    return NextResponse.json({ error: "run_id required" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "run_id not found" }, { status: 404 });
  }

  const artifact = buildResultsArtifact(run);
  const snapshot = artifact.snapshot as SnapshotV2 | null;
  if (!snapshot) {
    return NextResponse.json({ error: "snapshot missing" }, { status: 404 });
  }

  const decisionArtifact = buildDecisionArtifact({
    snapshot,
    conclusion: (artifact.conclusion ?? null) as ConclusionV2 | null,
    layer_fusion: (artifact.layer_fusion ?? null) as LayerFusionResult | null,
    business_profile: (artifact.business_profile ?? null) as BusinessProfile | null,
    readiness_level: artifact.readiness_level ?? null,
    diagnose_mode: artifact.diagnose_mode ?? false,
    mapping_confidence: artifact.mapping_confidence ?? null,
    benchmarks: (artifact.benchmarks ?? null) as BenchmarkResult | null,
  });

  let output = decisionArtifact;

  if (mode === "learned") {
    const previous = process.env.LEARNING_INFERENCE;
    process.env.LEARNING_INFERENCE = "true";
    try {
      const analysisResult = buildAnalysisResult(runId, {
        ...artifact,
        decision_artifact: decisionArtifact,
      });
      output = await applyLearningToDecisionArtifact({
        analysis_result: analysisResult,
        decision_artifact: decisionArtifact,
      });
    } finally {
      if (previous === undefined) delete process.env.LEARNING_INFERENCE;
      else process.env.LEARNING_INFERENCE = previous;
    }
  }

  return NextResponse.json({
    decision_artifact: output,
    meta: {
      run_id: run.run_id,
      created_at: run.created_at ?? null,
      industry_key: artifact.business_profile?.industry_bucket ?? null,
      source: artifact.run_manifest?.mode ?? run.mode ?? null,
      inference_enabled: mode === "learned",
      model_version: process.env.LEARNING_MODEL_VERSION ?? null,
      embedding_model: process.env.LEARNING_EMBEDDING_MODEL ?? "text-embedding-3-small",
    },
  });
}
