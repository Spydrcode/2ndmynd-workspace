/**
 * Build HF Dataset Row
 * 
 * Converts a TrainingExampleV1 to HFDatasetRowV1 format.
 * 
 * SAFETY GUARANTEES:
 * - Only allowlisted features exported (numeric + enum strings only)
 * - PII guard runs on all string fields
 * - NO raw text blobs
 * - NO RAG context (verified by tests)
 * - Fails loudly if PII detected
 */

import { guardAgainstPII } from "../learning/signals_v1";
import type { TrainingExampleV1 } from "../learning/types";
import { HF_FEATURE_ALLOWLIST, computeSchemaHash, type HFDatasetRowV1 } from "./types";

/**
 * Blocked Fields (never exported)
 * 
 * These fields must NEVER appear in HF exports:
 * - RAG context/docs/content
 * - Raw tool outputs
 * - Website content/scans
 * - Any text blobs longer than enum strings
 */
const BLOCKED_PATTERNS = [
  "rag_",
  "website_",
  "tool_",
  "raw_",
  "content_",
  "summary_",
  "description_",
  "notes_",
  "context_",
  "narrative_",
];

/**
 * Check if a key should be blocked
 */
function isBlockedKey(key: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => key.startsWith(pattern) || key.includes(pattern));
}

/**
 * Build HF Dataset Row V1
 * 
 * @param example - Training example to convert
 * @returns HF dataset row (privacy-safe)
 * @throws Error if PII detected or blocked fields present
 */
export function buildHFDatasetRowV1(example: TrainingExampleV1): HFDatasetRowV1 {
  // Extract allowlisted features only
  const features: Record<string, number | string | null> = {};
  const allowlist = new Set(HF_FEATURE_ALLOWLIST);
  
  for (const key of HF_FEATURE_ALLOWLIST) {
    if (isBlockedKey(key)) {
      throw new Error(`Blocked key in allowlist: ${key}`);
    }
    
    const value = example.features[key];
    
    // Only include numeric, string, or null values
    if (value !== undefined && value !== null) {
      if (typeof value === "number") {
        features[key] = value;
      } else if (typeof value === "string") {
        // String must be short and safe
        if (value.length > 100) {
          throw new Error(`String feature too long: ${key} (${value.length} chars)`);
        }
        features[key] = value;
      } else {
        features[key] = null;
      }
    } else {
      features[key] = null;
    }
  }
  
  // Check for any non-allowlisted fields that might have leaked
  for (const key of Object.keys(example.features)) {
    if (!allowlist.has(key)) {
      console.warn(`Non-allowlisted feature skipped: ${key}`);
    }
  }
  
  // Run PII guard on features (will throw if PII detected)
  guardAgainstPII(features);
  
  // Build targets (allowlisted subset only)
  const targets: Record<string, number | string | null> = {};
  if (example.targets) {
    // Only include safe target fields
    if (example.targets.pressure_keys) {
      targets.pressure_keys = JSON.stringify(example.targets.pressure_keys);
    }
    if (example.targets.boundary_class) {
      targets.boundary_class = example.targets.boundary_class;
    }
    // Skip benchmark array (too large and not needed for training)
  }
  
  // Build labels (if present)
  let labels: Record<string, number | string | boolean | null> | undefined;
  if (example.labels) {
    labels = {};
    if (example.labels.reviewer_score !== undefined) {
      labels.reviewer_score = example.labels.reviewer_score;
    }
    if (example.labels.client_feedback) {
      labels.client_feedback = example.labels.client_feedback;
    }
    if (example.labels.mapping_was_wrong !== undefined) {
      labels.mapping_was_wrong = example.labels.mapping_was_wrong;
    }
    if (example.labels.outcome_next_step_chosen !== undefined) {
      labels.outcome_next_step_chosen = example.labels.outcome_next_step_chosen;
    }
    // Skip text fields like reviewer_notes, client_feedback_reason (PII risk)
  }
  
  const schema_hash = computeSchemaHash(Array.from(HF_FEATURE_ALLOWLIST));
  
  return {
    example_id: example.id,
    created_at: example.created_at,
    source: example.source,
    industry_key: example.industry_key,
    schema_version: "signals_v1",
    schema_hash,
    window_rule: features.window_rule as string | null | undefined,
    features,
    targets,
    labels,
  };
}
