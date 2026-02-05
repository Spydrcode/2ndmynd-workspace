/**
 * Internal API: Model Status
 * 
 * GET /api/internal/runtime/models?internal=1
 * 
 * Returns status of all ML models (cohort engine, fine-tuned models, etc.)
 * 
 * Response:
 *   {
 *     cohort_engine: {
 *       enabled: boolean,
 *       model_version: string,
 *       promoted: boolean,
 *       silhouette_score?: number,
 *       stability_ari?: number,
 *       outlier_rate?: number
 *     }
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkInternalGuard } from "@/lib/internal/internal_guard";
import { promises as fs } from "fs";
import path from "path";
import { getCohortEngineConfig, type CohortEngineMeta } from "../../../../../lib/cohort_engine/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = checkInternalGuard(request);
  
  if (!guard.allowed) {
    return NextResponse.json(
      { error: guard.errorMessage },
      { status: guard.status }
    );
  }
  
  // Get cohort engine status
  const cohortConfig = getCohortEngineConfig();
  
  let cohort_engine_status = {
    enabled: cohortConfig.enabled,
    model_version: cohortConfig.modelVersion,
    promoted: false,
    available: false,
  };
  
  if (cohortConfig.enabled) {
    try {
      // Resolve latest pointer if needed
      let modelVersion = cohortConfig.modelVersion;
      
      if (modelVersion === "latest") {
        const latestPath = path.resolve(process.cwd(), "models/cohort_engine/LATEST.json");
        const latestContent = await fs.readFile(latestPath, "utf-8");
        const latest = JSON.parse(latestContent);
        modelVersion = latest.model_version;
      }
      
      // Load metadata
      const metaPath = path.resolve(process.cwd(), `models/cohort_engine/${modelVersion}/meta.json`);
      const metaContent = await fs.readFile(metaPath, "utf-8");
      const meta: CohortEngineMeta = JSON.parse(metaContent);
      
      const enrichedStatus = {
        ...cohort_engine_status,
        model_version: modelVersion,
        promoted: meta.promoted,
        available: true,
        silhouette_score: meta.silhouette_score,
        stability_ari: meta.stability_ari ?? undefined,
        outlier_rate: meta.outlier_rate ?? undefined,
        min_cluster_size: meta.min_cluster_size ?? undefined,
        training_rows: meta.training_rows,
        trained_at: meta.trained_at,
      };
      cohort_engine_status = enrichedStatus;
    } catch (error) {
      console.error("[Model Status] Failed to load cohort engine meta:", error);
    }
  }
  
  return NextResponse.json({
    cohort_engine: cohort_engine_status,
    timestamp: new Date().toISOString(),
  });
}
