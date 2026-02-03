import type { TrainingExampleV1 } from "../types";
import type { VectorDoc } from "./vector_types";

function formatNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "na";
  return value.toFixed(3);
}

export function buildVectorSummary(example: TrainingExampleV1) {
  const features = example.features;
  const top5 = features.top5_invoice_share as number | null;
  const decisionP50 = features.decision_lag_days_p50 as number | null;
  const pressures = example.targets.pressure_keys.slice(0, 3).join(",") || "none";
  const boundary = example.targets.boundary_class;
  return [
    `industry=${example.industry_key}`,
    `top5_share=${formatNumber(top5)}`,
    `decision_p50=${formatNumber(decisionP50)}`,
    `pressure=${pressures}`,
    `boundary=${boundary}`,
  ].join("; ");
}

export function buildVectorDoc(example: TrainingExampleV1, embedding_model = "text-embedding-3-small"): VectorDoc {
  const summary = buildVectorSummary(example);
  const metadata: VectorDoc["metadata"] = {
    source: example.source,
    industry_key: example.industry_key,
    window_rule: example.features.window_rule as string,
    mapping_confidence_level: example.features.mapping_confidence_level as number | null,
    pressure_keys: example.targets.pressure_keys,
    boundary_class: example.targets.boundary_class,
  };

  return {
    id: example.id,
    run_id: example.run_id,
    source: example.source,
    industry_key: example.industry_key,
    created_at: example.created_at,
    embedding_model,
    embedding: [],
    metadata,
    summary,
  };
}
