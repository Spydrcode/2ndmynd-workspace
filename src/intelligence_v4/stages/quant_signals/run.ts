import type { QuantStageContext } from "../../pipeline/context_builder";
import {
  type QuantPatternV1,
  type QuantSignalsV1,
  getStageSchema,
  validateStageArtifact,
} from "../../pipeline/contracts";
import { PipelineStageError } from "../../pipeline/errors";
import { runDoctrineGuards } from "../../pipeline/guards";
import type { StageModelConfig } from "../../pipeline/model_registry";
import { runStageModel } from "../../pipeline/model_runner";
import { loadStagePrompt } from "../../pipeline/prompt_loader";

import { prepareQuantInputs } from "./prepare_inputs";

type QuantStageParams = {
  context: QuantStageContext;
  model: StageModelConfig;
};

function buildDeterministicQuantArtifact(params: {
  model_id: string;
  prompt_version: string;
  context: QuantStageContext;
}): QuantSignalsV1 {
  const prepared = prepareQuantInputs({
    pack: params.context.pack,
    mode: params.context.mode,
  });

  const evidenceRefs = prepared.buckets.map((bucket) => bucket.evidence_ref);
  const patterns: QuantPatternV1[] = [];
  const anomalies: QuantPatternV1[] = [];

  const volatility = prepared.buckets.find((bucket) => bucket.id === "volatility");
  const decisionLag = prepared.buckets.find((bucket) => bucket.id === "decision_latency");
  const capacity = prepared.buckets.find((bucket) => bucket.id === "capacity_squeeze_proxy");

  if (volatility && volatility.value_bucket !== "unknown") {
    patterns.push({
      id: "volatility_pattern",
      description: `Workload volatility is ${volatility.value_bucket} in the selected window.`,
      confidence: volatility.confidence,
      evidence_refs: [volatility.evidence_ref],
    });
  }

  if (decisionLag && decisionLag.value_bucket !== "unknown") {
    patterns.push({
      id: "decision_lag_pattern",
      description: `Quote decision latency is ${decisionLag.value_bucket}, shaping response pressure.`,
      confidence: decisionLag.confidence,
      evidence_refs: [decisionLag.evidence_ref],
    });
  }

  if (capacity && capacity.value_bucket === "high") {
    anomalies.push({
      id: "capacity_squeeze_anomaly",
      description: "Capacity squeeze proxy is high relative to current throughput.",
      confidence: capacity.confidence,
      evidence_refs: [capacity.evidence_ref],
    });
  }

  if (patterns.length === 0) {
    patterns.push({
      id: "baseline_pattern",
      description: "Signal coverage is limited; patterns are directional rather than definitive.",
      confidence: "low",
      evidence_refs: evidenceRefs.slice(0, 2),
    });
  }

  return {
    schema_version: "quant_signals_v1",
    stage_name: "quant_signals",
    model_id: params.model_id,
    prompt_version: params.prompt_version,
    confidence:
      prepared.data_limits.row_limit_applied >= 100 || prepared.data_limits.saw_invoices
        ? "medium"
        : "low",
    evidence_refs: evidenceRefs,
    data_limits: prepared.data_limits,
    window: {
      start_date: prepared.window.start_date,
      end_date: prepared.window.end_date,
    },
    data_quality: {
      coverage_bucket:
        evidenceRefs.length >= 5
          ? "strong"
          : evidenceRefs.length >= 3
            ? "partial"
            : "insufficient",
      missingness_bucket: prepared.data_limits.saw_quotes && prepared.data_limits.saw_invoices ? "low" : "medium",
      notes: prepared.data_limits.notes,
    },
    signals: prepared.buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      value_bucket: bucket.value_bucket,
      direction: bucket.direction,
      confidence: bucket.confidence,
      evidence_refs: [bucket.evidence_ref],
    })),
    patterns,
    anomalies,
  };
}

export async function runQuantSignalsStage(params: QuantStageParams): Promise<QuantSignalsV1> {
  const { prompt, prompt_version } = loadStagePrompt("quant_signals");
  const schema = getStageSchema("quant_signals");

  const artifact = await runStageModel<QuantSignalsV1>({
    stage_name: "quant_signals",
    model: params.model,
    schema,
    prompt,
    input: {
      snapshot_window_mode: params.context.mode,
      input_limits: {
        quotes_count: params.context.pack.quotes?.length ?? 0,
        invoices_count: params.context.pack.invoices?.length ?? 0,
      },
    },
    deterministic: () =>
      buildDeterministicQuantArtifact({
        model_id: params.model.model_id,
        prompt_version,
        context: params.context,
      }),
  });

  const validation = validateStageArtifact("quant_signals", artifact);
  if (!validation.ok) {
    throw new PipelineStageError({
      code: "SCHEMA_VALIDATION_FAILED",
      stage_name: "quant_signals",
      reason: "Quant stage output failed schema validation.",
      validation_errors: validation.errors,
      next_action: "Inspect quant_signals output against quant_signals_v1 schema.",
    });
  }

  const guards = runDoctrineGuards("quant_signals", artifact);
  if (!guards.passed) {
    throw new PipelineStageError({
      code: "DOCTRINE_GUARD_FAILED",
      stage_name: "quant_signals",
      reason: "Quant stage output failed doctrine guards.",
      guard_failures: guards.failures.map((failure) => failure.message),
      next_action: "Remove recommendation language from quant stage and rerun.",
    });
  }

  return artifact;
}