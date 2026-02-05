/**
 * Vector Document Builder for Learning Layer
 * 
 * CRITICAL: RAG is EXCLUDED from vector learning docs by design.
 * 
 * This module builds vector documents from TrainingExampleV1, which:
 * - Contains only signals_v1 features (deterministic)
 * - Never includes RAG context
 * - Is used for similarity search in the learning layer
 * 
 * RAG context lives in ml/rag/* and is separate from learning vectors.
 * Do not confuse RAG embeddings with learning layer embeddings.
 */
import type { TrainingExampleV1 } from "../types";
import type { VectorDoc } from "./vector_types";
import { sanitizeMetadata } from "./metadata";

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

function resolveEmbeddingModel() {
  return process.env.LEARNING_EMBEDDING_MODEL ?? "text-embedding-3-small";
}

function resolveEmbeddingDim(model: string) {
  if (model === "text-embedding-3-small") return 1536;
  if (model === "text-embedding-3-large") return 3072;
  return 1536;
}

export function buildVectorDoc(
  example: TrainingExampleV1,
  embedding_model = resolveEmbeddingModel()
): VectorDoc {
  const summary = buildVectorSummary(example);
  const metadata: VectorDoc["metadata"] = {
    source: example.source,
    industry_key: example.industry_key,
    window_rule: example.features.window_rule as string,
    mapping_confidence_level: example.features.mapping_confidence_level as number | null,
    pressure_keys: example.targets.pressure_keys,
    boundary_class: example.targets.boundary_class,
  };
  const { clean } = sanitizeMetadata(metadata as Record<string, unknown>);

  return {
    id: example.id,
    run_id: example.run_id,
    source: example.source,
    industry_key: example.industry_key,
    created_at: example.created_at,
    embedding_model,
    embedding_dim: resolveEmbeddingDim(embedding_model),
    embedding: [],
    metadata: clean,
    summary,
  };
}
