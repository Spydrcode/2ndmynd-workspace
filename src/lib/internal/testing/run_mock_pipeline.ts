/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * INTERNAL ONLY - Testing infrastructure
 * 
 * Run full end-to-end mock pipeline:
 * 1. Find business website
 * 2. Scrape for context
 * 3. Generate CSV bundle
 * 4. Run analysis pipeline
 * 5. Store artifacts and return run_id
 */

import * as fs from "fs";
import * as path from "path";
import { findBusinessSite } from "../../../../packages/mockgen/src/web/find_site";
import { scrapeSite } from "../../../../packages/mockgen/src/web/scrape_site";
import { runPipeline } from "../../../../packages/mockgen/src/run/run_pipeline";
import type { IndustryKey } from "../../../../packages/mockgen/src/types";
import { pickCuratedWebsite } from "./mock_websites";

export interface MockPipelineParams {
  industry: IndustryKey | "random";
  seed?: number;
  days?: number;
  capture_learning?: boolean;
  auto_label?: boolean;
  website_url?: string;
}

export interface MockPipelineStatus {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  progress: {
    step: string;
    pct?: number;
  };
  website?: string;
  bundle_zip?: string;
  run_id?: string;
  validation?: {
    ok: boolean;
    errors: string[];
  };
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface StatusWriter {
  update(status: Partial<MockPipelineStatus>): Promise<void>;
}

/**
 * Run the complete mock pipeline job
 */
export async function runMockPipelineJob(
  params: MockPipelineParams,
  statusWriter: StatusWriter
): Promise<void> {
  try {
    const startedAt = new Date().toISOString();
    await statusWriter.update({
      status: "running",
      started_at: startedAt,
    });

    // Step 1: Pick industry
    const industries: IndustryKey[] = ["hvac", "plumbing", "electrical", "landscaping", "cleaning"];
    const industry = params.industry === "random" 
      ? industries[Math.floor(Math.random() * industries.length)]
      : params.industry;

    await statusWriter.update({
      progress: { step: "selecting industry", pct: 5 },
    });

    // Step 2: Find website
    await statusWriter.update({
      progress: { step: "searching for business website", pct: 15 },
    });

    const normalizedUrl = params.website_url
      ? params.website_url.startsWith("http")
        ? params.website_url
        : `https://${params.website_url}`
      : null;

    const curated = !normalizedUrl ? pickCuratedWebsite(industry, params.seed) : null;
    const selectedUrl = normalizedUrl ?? curated ?? null;

    let siteUrl = selectedUrl;
    if (!siteUrl) {
      const siteResult = await findBusinessSite(
        industry,
        "Phoenix, AZ", // Default service area
        process.env.SERP_API_KEY
      );
      siteUrl = siteResult?.url ?? null;
    }

    if (!siteUrl) {
      throw new Error("Could not find business website");
    }

    await statusWriter.update({
      website: siteUrl,
    });

    // Step 3: Scrape website
    await statusWriter.update({
      progress: { step: "scraping website for context", pct: 30 },
    });

    await scrapeSite(siteUrl);

    // Step 4: Generate bundle
    await statusWriter.update({
      progress: { step: "generating CSV data", pct: 50 },
    });

    const seed = params.seed ?? Math.floor(Math.random() * 1000000);
    const days = params.days ?? 90;
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const outputDir = path.join(process.cwd(), "mock_runs");

    await statusWriter.update({
      progress: { step: "running analysis pipeline", pct: 70 },
    });

    const previousCapture = process.env.LEARNING_CAPTURE;
    if (params.capture_learning) {
      process.env.LEARNING_CAPTURE = "true";
    }

    const pipelineResult = await runPipeline({
      industry,
      seed,
      days,
      startDate,
      endDate,
      runAnalysis: true,
      outputDir,
      searchApiKey: process.env.SERP_API_KEY,
      websiteUrl: siteUrl,
    });

    if (previousCapture === undefined) {
      delete process.env.LEARNING_CAPTURE;
    } else {
      process.env.LEARNING_CAPTURE = previousCapture;
    }

    await statusWriter.update({
      progress: { step: "saving artifacts", pct: 90 },
    });

    // Step 6: Extract run_id from analysis result
    // The analysis result should contain metadata we can use to identify the run
    const run_id = generateRunId(pipelineResult);

    // Step 7: Validate results
    const validation = validatePipelineResult(pipelineResult);

    if (params.auto_label) {
      try {
        const { listExamples, updateLabels } = await import("../../learning/store_jsonl");
        const candidates = await listExamples({ source: "mock", since: startedAt });
        if (candidates.length > 0) {
          const latest = candidates.sort((a: { created_at: string }, b: { created_at: string }) => (a.created_at > b.created_at ? 1 : -1))[candidates.length - 1];
          updateLabels(latest.id, {
            reviewer_score: 2,
            reviewer_notes: "auto-label",
            outcome_next_step_chosen: true,
          });
        }
      } catch (error) {
        console.error("[Mock Pipeline] Auto-label failed:", error);
      }
    }

    await statusWriter.update({
      status: "done",
      progress: { step: "complete", pct: 100 },
      bundle_zip: pipelineResult.zipPath,
      run_id,
      validation,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    await statusWriter.update({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      completed_at: new Date().toISOString(),
    });
    throw error;
  }
}

/**
 * Generate a unique run_id from pipeline result
 */
function generateRunId(pipelineResult: any): string {
  // Use bundle name as basis for run_id
  const bundleName = path.basename(pipelineResult.bundlePath);
  return `mock_${bundleName}`;
}

/**
 * Validate pipeline result
 */
function validatePipelineResult(pipelineResult: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!pipelineResult.manifest) {
    errors.push("Missing manifest");
  }

  if (pipelineResult.error) {
    errors.push(`Pipeline error: ${pipelineResult.error}`);
  }

  if (!pipelineResult.bundlePath || !fs.existsSync(pipelineResult.bundlePath)) {
    errors.push("Bundle directory not found");
  }

  if (!pipelineResult.zipPath || !fs.existsSync(pipelineResult.zipPath)) {
    errors.push("Bundle zip not found");
  }

  // Check for required CSV files
  if (pipelineResult.bundlePath && fs.existsSync(pipelineResult.bundlePath)) {
    const requiredFiles = ["quotes_export.csv", "invoices_export.csv", "calendar_export.csv"];
    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(pipelineResult.bundlePath, file))) {
        errors.push(`Missing ${file}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Create a file-based status writer
 */
export function createFileStatusWriter(job_id: string): StatusWriter {
  const statusPath = path.join(process.cwd(), "mock_runs", "_jobs", `${job_id}.status.json`);

  // Ensure directory exists
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });

  // Initialize status file
  const initialStatus: MockPipelineStatus = {
    job_id,
    status: "queued",
    progress: { step: "queued" },
  };

  fs.writeFileSync(statusPath, JSON.stringify(initialStatus, null, 2));

  return {
    async update(partialStatus: Partial<MockPipelineStatus>) {
      // Read current status
      let currentStatus: MockPipelineStatus;
      try {
        currentStatus = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
      } catch {
        currentStatus = initialStatus;
      }

      // Merge updates
      const newStatus = { ...currentStatus, ...partialStatus };

      // Write back
      fs.writeFileSync(statusPath, JSON.stringify(newStatus, null, 2));
    },
  };
}

/**
 * Read job status from file
 */
export function readJobStatus(job_id: string): MockPipelineStatus | null {
  const statusPath = path.join(process.cwd(), "mock_runs", "_jobs", `${job_id}.status.json`);

  if (!fs.existsSync(statusPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  } catch {
    return null;
  }
}
