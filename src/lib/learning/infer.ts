/**
 * Learning Layer - Model Inference
 * 
 * Applies learned models to enhance decision pipeline outputs
 * 
 * Feature flag: LEARNING_INFERENCE=true
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import type { DecisionArtifactV1, PressureSignalV1 } from "../types/decision_artifact";
import type { AnalysisResult } from "../intelligence/run_analysis";
import type { BoundaryClass, SignalsV1Record } from "./types";
import { extractSignalsV1 } from "./signals_v1";

export interface LearnedOutputs {
  pressure_keys?: string[];
  boundary_class?: BoundaryClass;
  confidence?: number;
}

/**
 * Apply learned models to snapshot features
 * 
 * Only runs if LEARNING_INFERENCE=true and models exist
 */
export async function applyLearnedModels(params: {
  features: SignalsV1Record;
  models_dir?: string;
}): Promise<LearnedOutputs | null> {
  // Guard: only infer if explicitly enabled
  if (process.env.LEARNING_INFERENCE !== "true") {
    return null;
  }

  const modelsDir = params.models_dir ?? path.join(process.cwd(), "models");
  
  // Check if models exist
  if (!fs.existsSync(modelsDir)) {
    console.warn("[LEARNING] Models directory not found, skipping inference");
    return null;
  }

  try {
    // Run Python inference script
    const result = await runPythonInference(params.features, modelsDir);
    return result;
  } catch (error) {
    console.error("[LEARNING] Inference failed:", error);
    return null;
  }
}

/**
 * Run Python inference script
 */
async function runPythonInference(features: SignalsV1Record, modelsDir: string): Promise<LearnedOutputs> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "infer.py");
    
    const child = spawn(process.env.PYTHON_PATH || "python", [
      scriptPath,
      "--models", modelsDir,
      "--features", JSON.stringify(features),
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python inference failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse inference output: ${stdout}`));
      }
    });
  });
}

export function augmentDecisionArtifact(params: {
  decision_artifact: DecisionArtifactV1;
  learned_outputs: LearnedOutputs | null;
  features: SignalsV1Record;
}): DecisionArtifactV1 {
  if (!params.learned_outputs) {
    return params.decision_artifact;
  }

  const augmented: DecisionArtifactV1 = { ...params.decision_artifact };
  const mappingLow = params.features.mapping_confidence_level === 0;

  if (params.learned_outputs.pressure_keys?.length && augmented.pressure_map?.length) {
    const byKey = new Map<string, PressureSignalV1>();
    for (const entry of augmented.pressure_map) {
      byKey.set(entry.key, entry);
    }
    const reordered: PressureSignalV1[] = [];
    for (const key of params.learned_outputs.pressure_keys) {
      const item = byKey.get(key);
      if (item) {
        reordered.push(item);
        byKey.delete(key);
      }
    }
    reordered.push(...byKey.values());
    augmented.pressure_map = reordered;
  }

  const boundaryClass = mappingLow ? "confirm_mappings" : params.learned_outputs.boundary_class;
  if (boundaryClass === "confirm_mappings") {
    augmented.boundary = "Confirm data mappings before acting on this decision.";
    augmented.confidence = {
      level: "low",
      reason: "Mapping confidence is low or learning flagged confirm_mappings.",
    };
  }

  return augmented;
}

export async function applyLearningToDecisionArtifact(params: {
  analysis_result: AnalysisResult;
  decision_artifact: DecisionArtifactV1;
}): Promise<DecisionArtifactV1> {
  const { features } = extractSignalsV1(params.analysis_result);
  const learned_outputs = await applyLearnedModels({ features });
  return augmentDecisionArtifact({
    decision_artifact: params.decision_artifact,
    learned_outputs,
    features,
  });
}
