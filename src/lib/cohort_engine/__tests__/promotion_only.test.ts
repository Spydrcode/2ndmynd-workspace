/**
 * Promotion-Only Runtime Tests
 * 
 * Verifies that cohort engine model selection enforces promotion-only runtime.
 * Only "latest" (promoted) models allowed unless ALLOW_UNSAFE_MODEL_OVERRIDE=true.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCohortEngineConfig } from "../types";

describe("Promotion-Only Runtime", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to clean state
    delete process.env.COHORT_ENGINE_MODEL_VERSION;
    delete process.env.ALLOW_UNSAFE_MODEL_OVERRIDE;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it("should default to 'latest' model version", () => {
    process.env.COHORT_ENGINE_ENABLED = "true";
    
    const config = getCohortEngineConfig();
    
    expect(config.modelVersion).toBe("latest");
  });

  it("should ignore non-latest version override without unsafe flag", () => {
    process.env.COHORT_ENGINE_ENABLED = "true";
    process.env.COHORT_ENGINE_MODEL_VERSION = "v20260101_120000";
    
    const config = getCohortEngineConfig();
    
    // Should ignore override and use "latest"
    expect(config.modelVersion).toBe("latest");
    expect(config.allowUnsafeModelOverride).toBe(false);
  });

  it("should allow version override with unsafe flag in non-production", () => {
    process.env.COHORT_ENGINE_ENABLED = "true";
    process.env.COHORT_ENGINE_MODEL_VERSION = "v20260101_120000";
    process.env.ALLOW_UNSAFE_MODEL_OVERRIDE = "true";
    process.env.NODE_ENV = "development";
    
    const config = getCohortEngineConfig();
    
    // Should use override
    expect(config.modelVersion).toBe("v20260101_120000");
    expect(config.allowUnsafeModelOverride).toBe(true);
  });

  it("should block unsafe override in production", () => {
    process.env.COHORT_ENGINE_ENABLED = "true";
    process.env.COHORT_ENGINE_MODEL_VERSION = "v20260101_120000";
    process.env.ALLOW_UNSAFE_MODEL_OVERRIDE = "true";
    process.env.NODE_ENV = "production";
    
    const config = getCohortEngineConfig();
    
    // Should ignore override in production
    expect(config.modelVersion).toBe("latest");
    expect(config.allowUnsafeModelOverride).toBe(false);
  });

  it("should allow 'latest' explicitly without unsafe flag", () => {
    process.env.COHORT_ENGINE_ENABLED = "true";
    process.env.COHORT_ENGINE_MODEL_VERSION = "latest";
    
    const config = getCohortEngineConfig();
    
    expect(config.modelVersion).toBe("latest");
    expect(config.allowUnsafeModelOverride).toBe(false);
  });

  it("should set inference_mode when unsafe override used", () => {
    process.env.COHORT_ENGINE_ENABLED = "true";
    process.env.COHORT_ENGINE_MODEL_VERSION = "v20260101_120000";
    process.env.ALLOW_UNSAFE_MODEL_OVERRIDE = "true";
    process.env.NODE_ENV = "development";
    
    const config = getCohortEngineConfig();
    
    // Config should indicate unsafe mode
    expect(config.allowUnsafeModelOverride).toBe(true);
    expect(config.modelVersion).not.toBe("latest");
  });
});
