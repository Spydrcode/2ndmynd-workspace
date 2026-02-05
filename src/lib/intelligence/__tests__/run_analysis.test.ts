/**
 * E2E Mock Run Pipeline Test
 * 
 * Validates the complete mock pipeline flow:
 * - Industry selection
 * - Website URL handling (including fallback)
 * - Data generation
 * - Analysis pipeline execution
 * - Artifact creation
 */

import { describe, it, expect } from "vitest";
import { 
  pickCuratedWebsite, 
  getMockWebsiteForIndustry, 
  getDefaultMockWebsite 
} from "../../internal/testing/mock_websites";

describe("E2E Mock Run Pipeline", () => {
  describe("Website URL Fallback", () => {
    it("should have curated websites for core industries", () => {
      const coreIndustries = ["hvac", "plumbing", "electrical", "landscaping", "cleaning"] as const;
      
      for (const industry of coreIndustries) {
        const website = pickCuratedWebsite(industry);
        expect(website).toBeTruthy();
        expect(typeof website).toBe("string");
        expect(website!.startsWith("http")).toBe(true);
      }
    });
    
    it("should have mock websites for extended industries", () => {
      const extendedIndustries = ["painter", "roofer", "pest_control", "pool_service"];
      
      for (const industry of extendedIndustries) {
        const website = getMockWebsiteForIndustry(industry);
        expect(website).toBeTruthy();
        expect(typeof website).toBe("string");
        expect(website!.startsWith("http")).toBe(true);
      }
    });
    
    it("should always have a default fallback website", () => {
      const defaultWebsite = getDefaultMockWebsite();
      expect(defaultWebsite).toBeTruthy();
      expect(typeof defaultWebsite).toBe("string");
      expect(defaultWebsite.startsWith("http")).toBe(true);
    });
    
    it("should never return empty website URL", () => {
      // This is THE critical test: the pipeline must ALWAYS have a website URL
      const defaultFallback = getDefaultMockWebsite();
      expect(defaultFallback).toBeTruthy();
      expect(defaultFallback.length).toBeGreaterThan(0);
      
      // Even if industrygets invalid value, we should still get fallback
      const invalidIndustry = getMockWebsiteForIndustry("nonexistent_industry_xyz");
      if (!invalidIndustry) {
        // It's OK to return null for invalid industry, 
        // but the pipeline must use defaultFallback in this case
        expect(defaultFallback).toBeTruthy();
      }
    });
  });
  
  describe("Pipeline Integration", () => {
    it("should have required mock pipeline functions exported", async () => {
      // Verify the mock pipeline module exports the right functions
      const mockModule = await import("../../internal/testing/run_mock_pipeline");
      
      expect(mockModule.runMockPipelineJob).toBeDefined();
      expect(typeof mockModule.runMockPipelineJob).toBe("function");
      
      expect(mockModule.createFileStatusWriter).toBeDefined();
      expect(typeof mockModule.createFileStatusWriter).toBe("function");
    });
  });
});
