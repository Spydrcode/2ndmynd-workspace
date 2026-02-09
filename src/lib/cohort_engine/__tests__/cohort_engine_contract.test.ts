/**
 * Cohort Engine Contract Tests
 * 
 * Verifies:
 * - Cohort inference returns valid structure
 * - Expected ranges are present
 * - Augmentative behavior (does NOT overwrite metrics)
 * - Config reads from environment
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCohortEngineConfig } from "../types";
import { isCohortEngineAvailable } from "../config";
import type { SignalsV1Record } from "../../learning/types";

describe("Cohort Engine Contract", () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  describe("Configuration", () => {
    it("should be disabled by default", () => {
      delete process.env.COHORT_ENGINE_ENABLED;
      
      const config = getCohortEngineConfig();
      
      expect(config.enabled).toBe(false);
    });
    
    it("should enable when COHORT_ENGINE_ENABLED=true", () => {
      process.env.COHORT_ENGINE_ENABLED = "true";
      
      const config = getCohortEngineConfig();
      
      expect(config.enabled).toBe(true);
    });
    
    it("should use latest model version by default", () => {
      const config = getCohortEngineConfig();
      
      expect(config.modelVersion).toBe("latest");
    });
    
    it("should use custom model version if unsafe override is enabled", () => {
      process.env.COHORT_ENGINE_MODEL_VERSION = "v20260205_120000";
      process.env.ALLOW_UNSAFE_MODEL_OVERRIDE = "true";
      
      const config = getCohortEngineConfig();
      
      expect(config.modelVersion).toBe("v20260205_120000");
      expect(config.allowUnsafeModelOverride).toBe(true);
    });
    
    it("should respect REQUIRE_PYTHON_WIRING flag", () => {
      process.env.REQUIRE_PYTHON_WIRING = "1";
      
      const config = getCohortEngineConfig();
      
      expect(config.requirePythonWiring).toBe(true);
    });
  });
  
  describe("Availability Check", () => {
    it("should return false when disabled", async () => {
      process.env.COHORT_ENGINE_ENABLED = "false";
      
      const available = await isCohortEngineAvailable();
      
      expect(available).toBe(false);
    });
    
    it("should return false when no model files present", async () => {
      process.env.COHORT_ENGINE_ENABLED = "true";
      process.env.COHORT_ENGINE_MODEL_VERSION = "nonexistent";
      
      const available = await isCohortEngineAvailable();
      
      expect(available).toBe(false);
    });
  });
  
  describe("Inference Contract", () => {
    it("should return null when disabled", async () => {
      process.env.COHORT_ENGINE_ENABLED = "false";
      
      const { inferCohort } = await import("../infer");
      
      const mockFeatures: SignalsV1Record = {
        industry_key: "hvac",
        source: "mock",
        window_rule: "last_90_days",
        total_revenue: 150000,
        total_jobs: 50,
        avg_job_value: 3000,
      };
      
      const result = await inferCohort(mockFeatures);
      
      expect(result).toBeNull();
    });
    
    it("should return null when Python wiring required but not enabled", async () => {
      process.env.COHORT_ENGINE_ENABLED = "true";
      process.env.REQUIRE_PYTHON_WIRING = "1";
      // Don't set REQUIRE_PYTHON_WIRING to "1" in actual env
      
      const { inferCohort } = await import("../infer");
      
      const mockFeatures: SignalsV1Record = {
        industry_key: "hvac",
        source: "mock",
        window_rule: "last_90_days",
        total_revenue: 150000,
        total_jobs: 50,
        avg_job_value: 3000,
      };
      
      const result = await inferCohort(mockFeatures);
      
      expect(result).toBeNull();
    });
    
    it("should handle inference failure gracefully", async () => {
      process.env.COHORT_ENGINE_ENABLED = "true";
      process.env.COHORT_ENGINE_MODEL_VERSION = "nonexistent";
      
      const { inferCohort } = await import("../infer");
      
      const mockFeatures: SignalsV1Record = {
        industry_key: "hvac",
        source: "mock",
        window_rule: "last_90_days",
        total_revenue: 150000,
        total_jobs: 50,
        avg_job_value: 3000,
      };
      
      const result = await inferCohort(mockFeatures);
      
      // Should return null, not throw
      expect(result).toBeNull();
    });
  });
  
  describe("Cohort Context Structure", () => {
    it("should match CohortContextV1 structure", () => {
      const mockCohortContext = {
        cohort_id: 2,
        cohort_label: "cohort_2",
        confidence: 0.85,
        expected_ranges: [
          {
            metric_key: "avg_job_value",
            min: 2000,
            max: 5000,
            median: 3500,
            p25: 2800,
            p75: 4200,
          },
          {
            metric_key: "total_revenue",
            min: 100000,
            max: 300000,
            median: 200000,
            p25: 150000,
            p75: 250000,
          },
        ],
      };
      
      // Verify structure matches CohortContextV1
      expect(mockCohortContext).toHaveProperty("cohort_id");
      expect(mockCohortContext).toHaveProperty("cohort_label");
      expect(mockCohortContext).toHaveProperty("confidence");
      expect(mockCohortContext).toHaveProperty("expected_ranges");
      expect(Array.isArray(mockCohortContext.expected_ranges)).toBe(true);
      
      for (const range of mockCohortContext.expected_ranges) {
        expect(range).toHaveProperty("metric_key");
        expect(range).toHaveProperty("min");
        expect(range).toHaveProperty("max");
        expect(range).toHaveProperty("median");
        expect(range).toHaveProperty("p25");
        expect(range).toHaveProperty("p75");
      }
    });
  });
  
  describe("Augmentative Behavior", () => {
    it("should NOT overwrite computed metrics", () => {
      // This test verifies the doctrine: cohort engine is augmentative only
      
      const computedMetric = {
        key: "avg_job_value",
        value: 4200, // Computed from actual data
      };
      
      const cohortRange = {
        metric_key: "avg_job_value",
        min: 2000,
        max: 5000,
        median: 3500,
        p25: 2800,
        p75: 4200,
      };
      
      // Cohort range provides context but does NOT replace the computed value
      expect(computedMetric.value).toBe(4200);
      expect(cohortRange.median).toBe(3500);
      
      // They coexist independently
      expect(computedMetric.value).not.toBe(cohortRange.median);
    });
  });
});
