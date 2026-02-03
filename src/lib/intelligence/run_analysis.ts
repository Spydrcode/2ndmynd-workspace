import { callTool } from "@/mcp/tool_registry";
import { hashInput } from "@/lib/decision/v2/run_context";
import { RunLogger } from "@/lib/intelligence/run_logger";

import { DataPackStats, DataPackV0 } from "./data_pack_v0";
import { buildSnapshotFromPack, InputRecognitionReport } from "./snapshot_from_pack";
import { buildBusinessProfile, BusinessProfile } from "./web_profile";
import { buildPredictiveContext, PredictiveContext } from "./predictive/predictive_context";
import {
  createManifest,
  markStepStart,
  markStepSuccess,
  markStepSkipped,
  markStepError,
  finalizeManifest,
  createInputFingerprint,
  RunManifest,
} from "./run_manifest";
import { detectOperatingArchetypes } from "./archetypes/detect";
import { getArchetypeWatchList } from "./archetypes/pressures";
import type { ArchetypeDetectionResult, ArchetypeWatchList } from "./archetypes/types";
import { computeReadiness, type ReadinessLevel } from "./readiness";
import type { LayerCoverage } from "./company_pack";
import { buildLayerFusion } from "./layer_fusion/layer_fusion";
import type { LayerFusionResult } from "./layer_fusion/types";
import type { BenchmarkResult } from "../benchmarks/types";
import type { DecisionArtifactV1 } from "../types/decision_artifact";
import { buildDecisionArtifact } from "../present/build_decision_artifact";

export type AnalysisResult = {
  run_id: string;
  input_hash: string;
  snapshot: unknown;
  conclusion: unknown;
  pipeline_meta?: unknown;
  validation: { ok: boolean; errors: string[] };
  business_profile: BusinessProfile;
  input_recognition?: InputRecognitionReport;
  data_warnings?: string[];
  predictive_context?: PredictiveContext;
  archetypes?: ArchetypeDetectionResult;
  predictive_watch_list?: ArchetypeWatchList;
  run_manifest: RunManifest;
  readiness_level?: ReadinessLevel;
  diagnose_mode?: boolean;
  layer_coverage?: LayerCoverage;
  layer_fusion?: LayerFusionResult;
  benchmarks?: BenchmarkResult;
  mapping_confidence?: "low" | "medium" | "high";
  decision_artifact?: DecisionArtifactV1;
};

export async function runAnalysisFromPack(params: {
  run_id: string;
  pack: DataPackV0;
  pack_stats?: DataPackStats | null;
  website_url?: string | null;
  workspace_id: string;
  lock_id?: string;
}) {
  const logger = new RunLogger(params.run_id);
  logger.logEvent("upload_received", { run_id: params.run_id });

  // Initialize manifest
  let manifest = createManifest(
    params.run_id,
    params.workspace_id,
    process.env.INTELLIGENCE_MODE ?? "mock",
    params.lock_id
  );

  // Step 1: Parse and normalize pack
  manifest = markStepStart(manifest, "parse_normalize_pack");
  const input_hash = hashInput(params.pack);
  const fingerprint = createInputFingerprint({
    file_names: params.pack_stats?.file_categories
      ? Object.keys(params.pack_stats.file_categories)
      : undefined,
    row_counts: {
      invoices: params.pack.invoices?.length ?? 0,
      quotes: params.pack.quotes?.length ?? 0,
    },
  });
  manifest = markStepSuccess(manifest, "parse_normalize_pack", [input_hash], `fingerprint: ${fingerprint}`);
  logger.logEvent("pack_normalized", { input_hash });

  // Step 2: Build business profile
  manifest = markStepStart(manifest, "build_business_profile");
  logger.logEvent("web_profile_start", { website_url: params.website_url ?? null });
  let business_profile: BusinessProfile;
  try {
    business_profile = await buildBusinessProfile(params.website_url);
    manifest = markStepSuccess(
      manifest,
      "build_business_profile",
      [business_profile.domain ?? "none"],
      `found_contact: ${business_profile.found_contact}`
    );
    logger.logEvent("web_profile_end", {
      domain: business_profile.domain,
      found_contact: business_profile.found_contact,
    });
  } catch (error) {
    business_profile = {
      name_guess: null,
      summary: "We could not fetch the website. Continue with the latest snapshot.",
      services: [],
      location_mentions: [],
      industry_bucket: "other",
      domain: params.website_url ? new URL(params.website_url).hostname : null,
      found_contact: false,
    };
    manifest = markStepError(
      manifest,
      "build_business_profile",
      error instanceof Error ? error.message : String(error)
    );
    logger.logEvent("web_profile_end", { error: RunLogger.serializeError(error) });
  }

  // Step 3: Build snapshot v2 (ML signals)
  manifest = markStepStart(manifest, "build_snapshot_v2");
  const { snapshot, input_recognition } = buildSnapshotFromPack(params.pack, {
    pack_stats: params.pack_stats ?? null,
  });
  const data_warnings: string[] = [];

  const fileCategories = params.pack_stats?.file_categories ?? null;
  const invoicesFileProvided = fileCategories
    ? (fileCategories.invoices ?? 0) > 0
    : (params.pack.invoices?.length ?? 0) > 0;
  const quotesFileProvided = fileCategories
    ? (fileCategories.quotes ?? 0) > 0
    : (params.pack.quotes?.length ?? 0) > 0;

  // Compute readiness level
  const readiness = computeReadiness({
    files_uploaded: params.pack_stats?.files ?? 0,
    quotes_recognized: input_recognition.quotes_detected_count,
    invoices_recognized: input_recognition.invoices_detected_count,
    invoices_file_uploaded: invoicesFileProvided,
    quotes_file_uploaded: quotesFileProvided,
  });

  const readiness_level = readiness.level;
  const diagnose_mode = readiness.diagnose_mode;

  if (invoicesFileProvided && input_recognition.invoices_detected_count === 0) {
    data_warnings.push(
      "Invoices file uploaded, but invoices were not recognized. Check column headers (Invoice #, Issued/Created date, Total, Status, Paid date)."
    );
  }
  if (quotesFileProvided && input_recognition.quotes_detected_count === 0) {
    data_warnings.push(
      "Quotes file uploaded, but quotes were not recognized. Check column headers (Quote ID, Created date, Total, Status, Approved date)."
    );
  }
  if (input_recognition.reasons_dropped.length) {
    data_warnings.push(...input_recognition.reasons_dropped);
  }

  manifest = markStepSuccess(
    manifest,
    "build_snapshot_v2",
    [`${input_recognition.invoices_detected_count} invoices`, `${input_recognition.quotes_detected_count} quotes`],
    data_warnings.length ? `warnings: ${data_warnings.length}` : undefined
  );

  // Step 3b: Layer fusion (cross-layer synthesis, deterministic)
  manifest = markStepStart(manifest, "layer_fusion");
  const layer_fusion = buildLayerFusion({
    companyPack: params.pack,
    snapshot_v2: snapshot,
    lookbackDays: snapshot.window.lookback_days,
    diagnose_mode,
  });
  manifest = markStepSuccess(
    manifest,
    "layer_fusion",
    [layer_fusion.recommended_focus, `${layer_fusion.pressure_patterns.length} patterns`],
    layer_fusion.warnings.length ? `warnings: ${layer_fusion.warnings.length}` : undefined
  );

  // Step 3c: Compute benchmarks
  manifest = markStepStart(manifest, "compute_benchmarks");
  let benchmarks: BenchmarkResult | undefined;
  try {
    const { computeBenchmarks } = await import("../benchmarks/benchmark_engine");
    const industryTags = [business_profile.industry_bucket, ...business_profile.services].filter(Boolean);
    benchmarks = computeBenchmarks({
      snapshot,
      industryTags,
      // These would ideally come from pack aggregates; for now use defaults
      invoiceTotals: [],
      weeklyInvoiceCounts: [],
      quoteAges: [],
      approvedToScheduledDays: [],
      invoicedToPaidDays: [],
    });
    manifest = markStepSuccess(manifest, "compute_benchmarks", [benchmarks.cohort_id]);
  } catch (error) {
    manifest = markStepError(
      manifest,
      "compute_benchmarks",
      error instanceof Error ? error.message : String(error)
    );
    benchmarks = undefined;
  }

  // Compute mapping confidence based on layer fusion warnings
  const mapping_confidence: "low" | "medium" | "high" = layer_fusion.linkage.linkage_weak
    ? "low"
    : layer_fusion.warnings.length > 0
      ? "medium"
      : "high";

  // Step 4: Build predictive context
  manifest = markStepStart(manifest, "predictive_context");
  const predictive_context = buildPredictiveContext({
    business_profile,
    snapshot_keywords: [], // Could extract from job types if available
  });
  manifest = markStepSuccess(manifest, "predictive_context", [predictive_context.industry_tag]);

  // Step 4b: Detect operating archetypes (industry-agnostic patterns)
  const archetypes = detectOperatingArchetypes(snapshot, business_profile);
  
  // Add note if data is incomplete
  if (data_warnings.length > 0 && archetypes.archetypes.length > 0) {
    archetypes.notes = archetypes.notes ?? [];
    archetypes.notes.push("Inputs incomplete; archetype confidence reduced.");
  }

  // Generate archetype-based watch list (skipped in diagnose mode when inference is suppressed)
  const predictive_watch_list = readiness.suppress_inference
    ? null
    : getArchetypeWatchList(archetypes.archetypes, snapshot);

  let conclusion: unknown = null;
  let pipeline_meta: unknown = null;
  let validationResult = { ok: true, errors: [] };

  if (readiness.suppress_inference) {
    // Skip inference - DIAGNOSE mode suppresses business conclusions
    manifest = markStepSkipped(manifest, "infer_decision_v2", "Incomplete inputs - inference skipped");
    manifest = markStepSkipped(manifest, "validate_conclusion_v2", "Inference was skipped");

    conclusion = null;
    validationResult = { ok: true, errors: [] };
    logger.logEvent("inference_skipped", { reason: "incomplete_inputs" });
  } else {
    // Step 5: Run inference
    manifest = markStepStart(manifest, "infer_decision_v2");
    logger.logEvent("pipeline_start", { run_id: params.run_id });
    const pipelineResult = await callTool("pipeline.run_v2", {
      mode: "raw_snapshot",
      payload: { snapshot, run_id: params.run_id },
    });
    logger.logEvent("pipeline_end", { run_id: params.run_id });

    conclusion = (pipelineResult as { conclusion?: unknown }).conclusion;
    pipeline_meta = (pipelineResult as { meta?: unknown }).meta ?? null;
    manifest = markStepSuccess(manifest, "infer_decision_v2", ["conclusion"]);

    // Step 6: Validate conclusion
    manifest = markStepStart(manifest, "validate_conclusion_v2");
    logger.logEvent("validate_start", { run_id: params.run_id });
    validationResult = (await callTool("decision.validate_v2", {
      snapshot,
      conclusion,
    })) as { ok: boolean; errors: string[] };
    logger.logEvent("validate_end", { ok: validationResult.ok });
    manifest = markStepSuccess(manifest, "validate_conclusion_v2", [], `ok: ${validationResult.ok}`);
  }

  manifest = finalizeManifest(manifest);
  logger.logEvent("run_complete", { ok: validationResult.ok });

  // Build decision artifact (client-facing output)
  let decision_artifact: DecisionArtifactV1 | undefined;
  try {
    decision_artifact = buildDecisionArtifact({
      snapshot,
      conclusion: conclusion as ConclusionV2,
      layer_fusion,
      business_profile,
      readiness_level,
      diagnose_mode,
      mapping_confidence,
    });
  } catch (error) {
    logger.logEvent("decision_artifact_error", { error: RunLogger.serializeError(error) });
    decision_artifact = undefined;
  }

  const analysisResult = {
    run_id: params.run_id,
    input_hash,
    snapshot,
    conclusion,
    pipeline_meta,
    validation: validationResult,
    business_profile,
    input_recognition,
    data_warnings,
    predictive_context,
    archetypes,
    predictive_watch_list,
    run_manifest: manifest,
    readiness_level,
    diagnose_mode,
    layer_coverage: input_recognition.layer_coverage,
    layer_fusion,
    benchmarks,
    mapping_confidence,
    decision_artifact,
  } satisfies AnalysisResult;

  // Capture learning example if enabled
  if (process.env.LEARNING_CAPTURE === "true") {
    try {
      const { captureTrainingExample, inferRunSource } = await import("../learning/capture");
      const source = inferRunSource(manifest);
      await captureTrainingExample({
        analysis_result: analysisResult,
        source,
      });
    } catch (learningError) {
      // Don't fail the pipeline if learning capture fails
      logger.logEvent("learning_capture_error", { error: RunLogger.serializeError(learningError) });
    }
  }

  if (process.env.LEARNING_INFERENCE === "true" && analysisResult.decision_artifact) {
    try {
      const { applyLearningToDecisionArtifact } = await import("../learning/infer");
      analysisResult.decision_artifact = await applyLearningToDecisionArtifact({
        analysis_result: analysisResult,
        decision_artifact: analysisResult.decision_artifact,
      });
    } catch (learningError) {
      logger.logEvent("learning_inference_error", { error: RunLogger.serializeError(learningError) });
    }
  }

  return analysisResult;
}
