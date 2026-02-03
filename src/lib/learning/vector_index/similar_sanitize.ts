import type { SimilarVectorResult } from "./vector_types";

export function sanitizeSimilarResults(results: SimilarVectorResult[]) {
  return results.map((item) => ({
    id: item.id,
    run_id: item.run_id,
    industry_key: item.industry_key,
    created_at: item.created_at,
    score: item.score,
    pressure_keys: item.pressure_keys,
    boundary_class: item.boundary_class,
    embedding_model: item.embedding_model,
    embedding_dim: item.embedding_dim,
  }));
}
