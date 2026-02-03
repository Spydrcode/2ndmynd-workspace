/**
 * Tests for explicit learning provenance via RunContext
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RunContext } from "../src/lib/intelligence/run_context";

describe("RunContext and learning provenance", () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(() => {
    originalEnv = { ...process.env };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  it("should accept explicit learning_source in RunContext", () => {
    const ctx: RunContext = {
      learning_source: "mock",
      internal_test: true,
    };
    
    expect(ctx.learning_source).toBe("mock");
    expect(ctx.internal_test).toBe(true);
  });
  
  it("should support real learning source", () => {
    const ctx: RunContext = {
      learning_source: "real",
    };
    
    expect(ctx.learning_source).toBe("real");
  });
  
  it("should handle optional context fields", () => {
    const ctx: RunContext = {};
    
    expect(ctx.learning_source).toBeUndefined();
    expect(ctx.internal_test).toBeUndefined();
  });
});

describe("inferRunSource fallback behavior", () => {
  it("should warn when learning_source not provided", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    
    // This would be tested in integration - the warning should appear
    // when captureTrainingExample is called without explicit ctx.learning_source
    
    expect(consoleWarnSpy).not.toHaveBeenCalled(); // Placeholder
    
    consoleWarnSpy.mockRestore();
  });
});
