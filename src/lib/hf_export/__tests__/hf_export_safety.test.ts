/**
 * HF Export Safety Tests
 * 
 * Verifies that HF export enforces:
 * - PII guards (no emails, phones, unexpected strings)
 * - Feature allowlist (only signals_v1 keys)
 * - RAG exclusion (no rag_ fields)
 * - Schema hash stability
 */

import { describe, it, expect, vi } from "vitest";
import { buildHFDatasetRowV1 } from "../build_dataset_row";
import { computeSchemaHash, HF_FEATURE_ALLOWLIST } from "../types";
import type { TrainingExampleV1 } from "../../learning/types";
import { SIGNALS_V1_KEYS } from "../../learning/signals_v1";

describe("HF Export Safety", () => {
  const mockExample: TrainingExampleV1 = {
    id: "test-001",
    created_at: "2026-01-01T00:00:00Z",
    run_id: "run-001",
    source: "mock",
    industry_key: "hvac",
    feature_schema: "signals_v1",
    pipeline_version: "v1.0.0",
    features: {
      industry_key: "hvac",
      source: "mock",
      window_rule: "last_90_days",
      total_revenue: 150000,
      total_jobs: 50,
      avg_job_value: 3000,
      // ... rest of numeric features would be here
    },
    targets: {
      boundary_class: "stable",
      pressure_keys: [],
    },
  };
  
  it("should build valid HF row from training example", () => {
    const row = buildHFDatasetRowV1(mockExample);
    
    expect(row.example_id).toBe("test-001");
    expect(row.source).toBe("mock");
    expect(row.industry_key).toBe("hvac");
    expect(row.schema_version).toBe("signals_v1");
    expect(row.schema_hash).toBeTruthy();
    expect(row.features).toBeDefined();
  });
  
  it("should reject PII (email pattern)", () => {
    const badExample: TrainingExampleV1 = {
      ...mockExample,
      features: {
        ...mockExample.features,
        industry_key: "test@example.com", // Contains email pattern
      },
    };
    
    expect(() => buildHFDatasetRowV1(badExample)).toThrow(/PII detected/i);
  });
  
  it("should reject PII (phone pattern)", () => {
    const badExample: TrainingExampleV1 = {
      ...mockExample,
      features: {
        ...mockExample.features,
        industry_key: "call 555-123-4567", // Contains phone pattern
      },
    };
    
    expect(() => buildHFDatasetRowV1(badExample)).toThrow(/PII detected/i);
  });
  
  it("should reject string features longer than 100 chars", () => {
    const badExample: TrainingExampleV1 = {
      ...mockExample,
      features: {
        ...mockExample.features,
        industry_key: "a".repeat(101), // Too long
      },
    };
    
    expect(() => buildHFDatasetRowV1(badExample)).toThrow(/too long/i);
  });
  
  it("should compute stable schema hash", () => {
    const hash1 = computeSchemaHash(Array.from(SIGNALS_V1_KEYS));
    const hash2 = computeSchemaHash(Array.from(SIGNALS_V1_KEYS));
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(8);
  });
  
  it("should detect schema hash changes", () => {
    const hash1 = computeSchemaHash(Array.from(SIGNALS_V1_KEYS));
    const hash2 = computeSchemaHash([...SIGNALS_V1_KEYS, "new_feature"]);
    
    expect(hash1).not.toBe(hash2);
  });
  
  it("should have feature allowlist matching signals_v1 keys", () => {
    expect(HF_FEATURE_ALLOWLIST).toEqual(SIGNALS_V1_KEYS);
  });
  
  it("should not include RAG fields in allowlist", () => {
    for (const key of HF_FEATURE_ALLOWLIST) {
      expect(key).not.toMatch(/rag_/i);
      expect(key).not.toMatch(/website_/i);
      expect(key).not.toMatch(/tool_/i);
      expect(key).not.toMatch(/context_/i);
    }
  });
  
  it("should not include raw text blobs in allowlist", () => {
    for (const key of HF_FEATURE_ALLOWLIST) {
      expect(key).not.toMatch(/raw_/i);
      expect(key).not.toMatch(/content_/i);
      expect(key).not.toMatch(/summary_/i);
      expect(key).not.toMatch(/description_/i);
      expect(key).not.toMatch(/notes_/i);
    }
  });
  
  it("should only include numeric and short enum strings", () => {
    const row = buildHFDatasetRowV1(mockExample);
    
    for (const value of Object.values(row.features)) {
      if (value !== null && typeof value === "string") {
        expect(value.length).toBeLessThanOrEqual(100);
      }
    }
  });
  
  it("should warn on non-allowlisted features", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    
    const badExample: TrainingExampleV1 = {
      ...mockExample,
      features: {
        ...mockExample.features,
        rag_context: "This should not be exported", // Not in allowlist
      },
    };
    
    buildHFDatasetRowV1(badExample);
    
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Non-allowlisted feature skipped")
    );
    
    consoleWarnSpy.mockRestore();
  });
  
  it("should not include large text blobs in targets", () => {
    const row = buildHFDatasetRowV1(mockExample);
    
    // Targets should only include safe fields
    if (row.targets) {
      expect(row.targets.boundary_class).toBeDefined();
      expect(row.targets.pressure_keys).toBeDefined();
      // benchmark array should be skipped (too large)
      expect(row.targets).not.toHaveProperty("benchmark");
    }
  });
  
  it("should skip text fields in labels", () => {
    const exampleWithLabels: TrainingExampleV1 = {
      ...mockExample,
      labels: {
        reviewer_score: 3,
        reviewer_notes: "This looks good", // Should be skipped (PII risk)
        client_feedback: "up",
        client_feedback_reason: "Great work", // Should be skipped (PII risk)
        mapping_was_wrong: false,
      },
    };
    
    const row = buildHFDatasetRowV1(exampleWithLabels);
    
    expect(row.labels?.reviewer_score).toBe(3);
    expect(row.labels?.client_feedback).toBe("up");
    expect(row.labels?.mapping_was_wrong).toBe(false);
    
    // Text fields should be skipped
    expect(row.labels).not.toHaveProperty("reviewer_notes");
    expect(row.labels).not.toHaveProperty("client_feedback_reason");
  });
});
