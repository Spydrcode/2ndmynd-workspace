import { nanoid } from "nanoid";
import type { AnalysisResult } from "../intelligence/run_analysis";
import type { IndustryKey, LearningSource, TrainingExampleV1 } from "./types";
import { extractSignalsV1 } from "./signals_v1";

export function buildTrainingExampleV1(params: {
  run_id: string;
  pipeline_version: string;
  generator_version?: string;
  analysis_result: AnalysisResult;
  source?: LearningSource;
  industry_key?: IndustryKey;
}): TrainingExampleV1 {
  const { features, targets } = extractSignalsV1(params.analysis_result);
  const source = params.source ?? (features.source as LearningSource);
  const industry_key = params.industry_key ?? (features.industry_key as IndustryKey);

  return {
    id: nanoid(),
    created_at: new Date().toISOString(),
    run_id: params.run_id,
    source,
    industry_key,
    feature_schema: "signals_v1",
    pipeline_version: params.pipeline_version,
    generator_version: params.generator_version,
    features,
    targets,
  };
}
