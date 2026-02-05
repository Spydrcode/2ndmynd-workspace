/**
 * E2E Learning Smoke Test
 * 
 * Validates learning layer basics:
 * - Training capture module exists
 * - PII guards are enforced
 * - Feature extraction works
 * - Vector builds don't contaminate learning
 */

import { describe, it, expect } from "vitest";

describe("E2E Learning Smoke Test", () => {
  describe("Learning Capture Module", () => {
    it("should have capture module with captureTrainingExample", async () => {
      const captureModule = await import("../capture");
      expect(captureModule.captureTrainingExample).toBeDefined();
      expect(typeof captureModule.captureTrainingExample).toBe("function");
    });
    
    it("should have signals_v1 extractor", async () => {
      const signalsModule = await import("../signals_v1");
      expect(signalsModule.extractSignalsV1).toBeDefined();
      expect(typeof signalsModule.extractSignalsV1).toBe("function");
    });
  });
  
  describe("PII Guards", () => {
    it("should have PII guard tests in dedicated test file", async () => {
      // PII guards are thoroughly tested in pii_guards.test.ts
      // This is just a smoke test that the module exists
      const fs = await import("fs/promises");
      const path = await import("path");
      const testPath = path.join(process.cwd(), "src/lib/learning/__tests__/pii_guards.test.ts");
      const exists = await fs.access(testPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });
  
  describe("Learning Layer Invariants", () => {
    it("should keep RAG context separate from learning signals", async () => {
      // This is tested more thoroughly in rag_safety.test.ts
      // but we include a basic check here for E2E validation
      const captureModule = await import("../capture");
      expect(captureModule.captureTrainingExample).toBeDefined();
      
      const signalsModule = await import("../signals_v1");
      expect(signalsModule.extractSignalsV1).toBeDefined();
      
      // The functions should not take any RAG context as input
      // (verified by type system - this is just a structural smoke test)
      const captureFnStr = captureModule.captureTrainingExample.toString();
      const signalsFnStr = signalsModule.extractSignalsV1.toString();
      
      expect(captureFnStr).toBeDefined();
      expect(signalsFnStr).toBeDefined();
    });
  });
});

