/**
 * Baseline Loader - Load and validate industry baseline data
 * 
 * Supports ingestion of industry baseline metrics for benchmark comparisons
 */

import fs from "fs";
import path from "path";
import type { IndustryBucket } from "../industry";

export type BaselineData = {
  cohort_id: string;
  cohort_label: string;
  version: string;
  sample_size: number;
  created_at: string;
  industry_bucket: IndustryBucket;
  typical_services: string[];
  job_value_distribution: Record<string, number>;
  decision_lag_distribution: Record<string, number>;
  quote_to_invoice_flow: {
    approved: number;
    stalled: number;
    dropped: number;
  };
  revenue_concentration: {
    top_5_jobs_share: number;
    top_10_jobs_share: number;
    gini_coefficient: number;
  };
  cycle_time_medians: {
    quote_to_job_days: number;
    job_duration_days: number;
    invoice_to_paid_days: number;
  };
  volatility_metrics: {
    weekly_volume_cv: number;
    seasonal_factor: "low" | "medium" | "high";
  };
  notes?: string;
};

/**
 * Load baseline data from fixtures
 */
export function loadBaseline(industry: IndustryBucket): BaselineData | null {
  const baselinesDir = path.join(process.cwd(), "fixtures", "baselines");
  const filename = `${industry}_v1.json`;
  const filepath = path.join(baselinesDir, filename);

  if (!fs.existsSync(filepath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filepath, "utf-8");
    const data = JSON.parse(content) as BaselineData;
    return data;
  } catch (error) {
    console.error(`Failed to load baseline for ${industry}:`, error);
    return null;
  }
}

/**
 * Load all available baselines
 */
export function loadAllBaselines(): BaselineData[] {
  const baselinesDir = path.join(process.cwd(), "fixtures", "baselines");
  
  if (!fs.existsSync(baselinesDir)) {
    return [];
  }

  const files = fs.readdirSync(baselinesDir).filter((f) => f.endsWith(".json"));
  const baselines: BaselineData[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(baselinesDir, file), "utf-8");
      const data = JSON.parse(content) as BaselineData;
      baselines.push(data);
    } catch (error) {
      console.warn(`Skipping invalid baseline file ${file}:`, error);
    }
  }

  return baselines;
}

/**
 * Get baseline summary for logging/debugging
 */
export function getBaselineSummary(baseline: BaselineData): string {
  return `${baseline.cohort_label} (n=${baseline.sample_size}, created ${new Date(baseline.created_at).toLocaleDateString()})`;
}

/**
 * Validate baseline data structure
 */
export function validateBaseline(data: unknown): data is BaselineData {
  if (!data || typeof data !== "object") return false;
  
  const required = [
    "cohort_id",
    "cohort_label",
    "version",
    "sample_size",
    "industry_bucket",
    "job_value_distribution",
    "revenue_concentration",
    "cycle_time_medians",
  ];

  return required.every((field) => field in data);
}
