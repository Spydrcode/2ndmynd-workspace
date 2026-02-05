/**
 * Hugging Face Dataset Export Types
 * 
 * CRITICAL: Only signals_v1 features are exported.
 * - NO raw CSV rows
 * - NO PII (enforced by allowlist + guards)
 * - NO RAG context (verified by tests)
 * - NO text blobs
 * 
 * This module provides types and utilities for exporting privacy-safe,
 * aggregated signals to Hugging Face datasets.
 */

import { createHash } from "crypto";
import { SIGNALS_V1_KEYS } from "../learning/signals_v1";

/**
 * Hugging Face Dataset Row V1
 * 
 * Represents a single training example in HF dataset format.
 * Only allowlisted numeric/enum features are included.
 */
export interface HFDatasetRowV1 {
  example_id: string;
  created_at: string;
  source: "mock" | "real";
  industry_key: string;
  schema_version: "signals_v1";
  schema_hash: string;
  window_rule?: string | null;
  features: Record<string, number | string | null>;
  targets?: Record<string, number | string | null>;
  labels?: Record<string, number | string | boolean | null>;
}

/**
 * Feature Allowlist (exactly matching signals_v1 keys)
 * 
 * This must stay in sync with SIGNALS_V1_KEYS from signals_v1.ts.
 * Any deviation will cause schema_hash mismatches.
 */
export const HF_FEATURE_ALLOWLIST: readonly string[] = SIGNALS_V1_KEYS;

/**
 * Compute Schema Hash
 * 
 * Generates a stable SHA-256 hash of the feature schema.
 * Used for version tracking and compatibility checking.
 * 
 * @param keys - Ordered list of feature keys
 * @returns 8-character hex hash
 */
export function computeSchemaHash(keys: string[]): string {
  const canonical = `signals_v1:${keys.join(",")}`;
  return createHash("sha256").update(canonical).digest("hex").slice(0, 8);
}

/**
 * HF Export Configuration
 */
export interface HFExportConfig {
  enabled: boolean;
  token: string | null;
  repo: string;
  private: boolean;
  maxRows: number;
  splitStrategy: "none" | "by_source" | "by_industry" | "by_source_industry";
  outDir: string;
}

/**
 * Get HF Export Config from Environment
 */
export function getHFExportConfig(): HFExportConfig {
  return {
    enabled: process.env.HF_EXPORT_ENABLED === "true",
    token: process.env.HF_TOKEN ?? null,
    repo: process.env.HF_DATASET_REPO ?? "2ndmynd/signals_v1_private",
    private: process.env.HF_DATASET_PRIVATE !== "false",
    maxRows: parseInt(process.env.HF_EXPORT_MAX_ROWS ?? "50000", 10),
    splitStrategy: (process.env.HF_EXPORT_SPLIT_STRATEGY as HFExportConfig["splitStrategy"]) ?? "by_source_industry",
    outDir: process.env.HF_EXPORT_OUT_DIR ?? "runs/hf_export",
  };
}

/**
 * HF Export Bundle Info
 */
export interface HFExportBundleInfo {
  generated_at: string;
  schema_version: "signals_v1";
  schema_hash: string;
  feature_keys: string[];
  total_rows: number;
  by_source: Record<string, number>;
  by_industry: Record<string, number>;
  splits?: Record<string, number>;
  git_sha?: string;
}

/**
 * HF Push Result
 */
export interface HFPushResult {
  pushed: boolean;
  revision?: string;
  error?: string;
}
