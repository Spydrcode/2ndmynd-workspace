import * as fs from "fs";
import * as path from "path";
import { nanoid } from "nanoid";
import type { AnalysisResult } from "../intelligence/run_analysis";
import type { IndustryKey, LearningSource, TrainingExampleV1 } from "./types";
import { extractSignalsV1 } from "./signals_v1";
import { appendExample } from "./store_jsonl";

function getPipelineVersion() {
  if (process.env.PIPELINE_VERSION) return process.env.PIPELINE_VERSION;
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  if (process.env.COMMIT_SHA) return process.env.COMMIT_SHA;
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const json = JSON.parse(raw);
    if (typeof json.version === "string") return json.version;
  } catch {
    return "unknown";
  }
  return "unknown";
}

export async function captureTrainingExample(params: {
  analysis_result: AnalysisResult;
  source?: LearningSource;
  industry_key?: IndustryKey;
  generator_version?: string;
  pipeline_version?: string;
}): Promise<void> {
  if (process.env.LEARNING_CAPTURE !== "true") return;
  try {
    const { features, targets } = extractSignalsV1(params.analysis_result);
    const source = params.source ?? (features.source as LearningSource);
    const industry_key = params.industry_key ?? (features.industry_key as IndustryKey);
    const example: TrainingExampleV1 = {
      id: nanoid(),
      created_at: new Date().toISOString(),
      run_id: params.analysis_result.run_id,
      source,
      industry_key,
      feature_schema: "signals_v1",
      pipeline_version: params.pipeline_version ?? getPipelineVersion(),
      generator_version: params.generator_version,
      features,
      targets,
    };
    appendExample(example);
    if (process.env.LEARNING_VECTOR_BACKEND && process.env.LEARNING_VECTOR_BACKEND !== "none") {
      try {
        const { buildVectorDoc } = await import("./vector_index/build_vector_doc");
        const { upsertVectorDocs } = await import("./vector_index/index_client");
        const doc = buildVectorDoc(example);
        await upsertVectorDocs([doc]);
      } catch (vectorError) {
        console.error("[LEARNING] Vector index update failed:", vectorError);
      }
    }
    console.log(`[LEARNING] Captured training example ${example.id} from run ${params.analysis_result.run_id}`);
  } catch (error) {
    console.error("[LEARNING] Failed to capture training example:", error);
  }
}

export function inferRunSource(run_manifest: AnalysisResult["run_manifest"]): LearningSource {
  const override = process.env.LEARNING_CAPTURE_SOURCE;
  if (override === "mock" || override === "real") return override;
  const mode = run_manifest?.mode?.toLowerCase?.() ?? "";
  const workspace = run_manifest?.workspace_id?.toLowerCase?.() ?? "";
  if (mode.includes("mock") || mode.includes("test") || workspace.includes("mock") || workspace.includes("test")) {
    return "mock";
  }
  return "real";
}
