import type { IndustryKey, LearningSource } from "../types";

export type VectorDoc = {
  id: string;
  run_id: string;
  source: LearningSource;
  industry_key: IndustryKey;
  created_at: string;
  embedding_model: string;
  embedding: number[];
  metadata: Record<string, string | number | boolean | null | string[]>;
  summary: string;
};

export type SimilarVectorResult = {
  id: string;
  run_id: string;
  industry_key: IndustryKey;
  created_at: string;
  score: number;
  pressure_keys?: string[];
  boundary_class?: string;
};
