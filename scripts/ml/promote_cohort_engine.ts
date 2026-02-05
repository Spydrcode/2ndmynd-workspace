#!/usr/bin/env node
/**
 * Promote Cohort Engine Model
 * 
 * Applies evaluation gates and updates LATEST pointer if passed.
 * 
 * Gates:
 * - silhouette_score ≥ 0.15
 * - stability_ari ≥ 0.60 (if available)
 * - outlier_rate ≤ 0.12
 * - min_cluster_size ≥ max(50, 0.02*N)
 * 
 * Usage:
 *   npm run cohort:promote -- --model_version=v20260205_120000
 */

import { promises as fs } from "fs";
import path from "path";
import type { CohortEngineMeta } from "../../src/lib/cohort_engine/types";

interface PromotionGates {
  silhouette_min: number;
  stability_ari_min: number;
  outlier_rate_max: number;
  min_cluster_size_min: number;
}

const GATES: PromotionGates = {
  silhouette_min: 0.15,
  stability_ari_min: 0.60,
  outlier_rate_max: 0.12,
  min_cluster_size_min: 50, // Will be adjusted based on training_rows
};

async function promoteModel(modelVersion: string): Promise<void> {
  const modelsDir = path.resolve(process.cwd(), "models/cohort_engine");
  const modelDir = path.join(modelsDir, modelVersion);
  const metaPath = path.join(modelDir, "meta.json");
  
  if (!(await fs.stat(metaPath).catch(() => null))) {
    console.error(`[Promote] Model not found: ${modelVersion}`);
    process.exit(1);
  }
  
  // Load metadata
  const content = await fs.readFile(metaPath, "utf-8");
  const meta: CohortEngineMeta = JSON.parse(content);
  
  console.log(`[Promote] Evaluating model: ${modelVersion}`);
  console.log(`  Silhouette: ${meta.silhouette_score?.toFixed(3) ?? "N/A"}`);
  console.log(`  Stability ARI: ${meta.stability_ari?.toFixed(3) ?? "N/A"}`);
  console.log(`  Outlier Rate: ${((meta.outlier_rate ?? 0) * 100).toFixed(1)}%`);
  console.log(`  Min Cluster Size: ${meta.min_cluster_size ?? "N/A"}`);
  
  // Apply gates
  const failed: string[] = [];
  
  if ((meta.silhouette_score ?? 0) < GATES.silhouette_min) {
    failed.push(`Silhouette too low: ${meta.silhouette_score?.toFixed(3)} < ${GATES.silhouette_min}`);
  }
  
  if (meta.stability_ari !== null && meta.stability_ari !== undefined) {
    if (meta.stability_ari < GATES.stability_ari_min) {
      failed.push(`Stability ARI too low: ${meta.stability_ari.toFixed(3)} < ${GATES.stability_ari_min}`);
    }
  }
  
  if ((meta.outlier_rate ?? 1) > GATES.outlier_rate_max) {
    failed.push(`Outlier rate too high: ${((meta.outlier_rate ?? 1) * 100).toFixed(1)}% > ${GATES.outlier_rate_max * 100}%`);
  }
  
  const minClusterThreshold = Math.max(50, Math.floor(meta.training_rows * 0.02));
  if ((meta.min_cluster_size ?? 0) < minClusterThreshold) {
    failed.push(`Min cluster size too small: ${meta.min_cluster_size} < ${minClusterThreshold}`);
  }
  
  // Report results
  if (failed.length > 0) {
    console.error("\n[Promote] ✗ Model FAILED promotion gates:");
    for (const reason of failed) {
      console.error(`  - ${reason}`);
    }
    process.exit(1);
  }
  
  console.log("\n[Promote] ✓ Model passed all gates");
  
  // Update meta to mark as promoted
  meta.promoted = true;
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
  
  // Update LATEST pointer
  const latestPath = path.join(modelsDir, "LATEST.json");
  const pointer = {
    model_version: modelVersion,
    promoted_at: new Date().toISOString(),
    silhouette_score: meta.silhouette_score,
    stability_ari: meta.stability_ari,
    outlier_rate: meta.outlier_rate,
  };
  
  await fs.writeFile(latestPath, JSON.stringify(pointer, null, 2) + "\n", "utf-8");
  
  console.log(`[Promote] Updated LATEST pointer → ${modelVersion}`);
  console.log("[Promote] ✓ Promotion complete");
}

async function main() {
  const args = process.argv.slice(2);
  const modelVersion = args.find((a) => a.startsWith("--model_version="))?.split("=")[1];
  
  if (!modelVersion) {
    console.error("Usage: npm run cohort:promote -- --model_version=<version>");
    process.exit(1);
  }
  
  await promoteModel(modelVersion);
}

main();
