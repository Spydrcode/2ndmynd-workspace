/**
 * Cohort Engine Inference (Node Wrapper)
 * 
 * Wraps Python cohort inference script.
 * Returns CohortInference or null if unavailable/failed.
 */

import { spawn } from "child_process";
import path from "path";
import { getCohortEngineConfig, type CohortInference } from "./types";
import type { SignalsV1Record } from "../learning/types";

/**
 * Infer Cohort
 * 
 * @param features - signals_v1 features
 * @returns Cohort inference or null if unavailable
 */
export async function inferCohort(features: SignalsV1Record): Promise<CohortInference | null> {
  const config = getCohortEngineConfig();
  
  if (!config.enabled) {
    return null;
  }
  
  if (config.requirePythonWiring && process.env.REQUIRE_PYTHON_WIRING !== "1") {
    console.warn("[Cohort Engine] Python wiring required but not enabled");
    return null;
  }
  
  const scriptPath = path.resolve(process.cwd(), config.pythonScript);
  
  return new Promise<CohortInference | null>((resolve) => {
    const args = [
      scriptPath,
      "--model_version",
      config.modelVersion,
      "--features",
      JSON.stringify(features),
    ];
    
    const proc = spawn("python", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let stdout = "";
    let stderr = "";
    
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    
    proc.on("close", (code) => {
      if (code === 0) {
        try {
          const result: CohortInference = JSON.parse(stdout);
          resolve(result);
        } catch (err) {
          console.error("[Cohort Engine] Failed to parse inference result:", err);
          resolve(null);
        }
      } else {
        console.error(`[Cohort Engine] Inference failed (code ${code}):`, stderr);
        resolve(null);
      }
    });
    
    proc.on("error", (err) => {
      console.error("[Cohort Engine] Spawn error:", err);
      resolve(null);
    });
  });
}
