/**
 * Cohort Engine Configuration
 * 
 * Provides runtime config for cohort inference.
 */

import { getCohortEngineConfig } from "./types";
import { promises as fs } from "fs";
import path from "path";
import type { CohortEngineMeta } from "./types";

/**
 * Load Cohort Engine Metadata
 * 
 * Reads meta.json from model directory.
 * 
 * @param modelVersion - Model version ("latest" or specific version)
 * @returns Model metadata
 */
export async function loadCohortEngineMeta(
  modelVersion: string = "latest"
): Promise<CohortEngineMeta | null> {
  const config = getCohortEngineConfig();
  
  if (!config.enabled) {
    return null;
  }
  
  try {
    // If "latest", resolve pointer first
    let resolvedVersion = modelVersion;
    
    if (modelVersion === "latest") {
      const pointerPath = path.resolve(process.cwd(), "models/cohort_engine/LATEST.json");
      const pointerContent = await fs.readFile(pointerPath, "utf-8");
      const pointer = JSON.parse(pointerContent);
      resolvedVersion = pointer.model_version;
    }
    
    const metaPath = path.resolve(process.cwd(), `models/cohort_engine/${resolvedVersion}/meta.json`);
    const metaContent = await fs.readFile(metaPath, "utf-8");
    const meta: CohortEngineMeta = JSON.parse(metaContent);
    
    return meta;
  } catch (err) {
    console.warn(`[Cohort Engine] Failed to load meta for version ${modelVersion}:`, err);
    return null;
  }
}

/**
 * Check if Cohort Engine is available
 * 
 * Verifies:
 * - COHORT_ENGINE_ENABLED=true
 * - Model files exist
 * - Python script exists
 */
export async function isCohortEngineAvailable(): Promise<boolean> {
  const config = getCohortEngineConfig();
  
  if (!config.enabled) {
    return false;
  }
  
  const meta = await loadCohortEngineMeta(config.modelVersion);
  
  if (!meta) {
    return false;
  }
  
  // Check Python script exists
  const scriptPath = path.resolve(process.cwd(), config.pythonScript);
  try {
    await fs.access(scriptPath);
    return true;
  } catch {
    return false;
  }
}
