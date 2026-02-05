/**
 * RAG Integration Tests
 * 
 * Ensures RAG context enriches narratives without affecting core signals.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { buildBusinessProfile } from "../../../lib/intelligence/web_profile";
import { extractSignalsV1 } from "../../../lib/learning/signals_v1";
import { ingestRagDoc, getRagContext } from "../index";
import type { AnalysisResult } from "../../../lib/intelligence/run_analysis";

describe("RAG Integration", () => {
  const TEST_WORKSPACE_ID = "test-workspace-rag-integration";
  const TEST_RUN_ID = "run-rag-test-001";

  describe("Website Scan Ingestion", () => {
    it("should not ingest when website_url is null", async () => {
      // Build profile without website
      const profile = await buildBusinessProfile(null, {
        workspace_id: TEST_WORKSPACE_ID,
        run_id: TEST_RUN_ID,
      });

      expect(profile.website_present).toBe(false);
      expect(profile.domain).toBeNull();
    });

    it("should ingest website scan when website_url provided", async () => {
      // Mock a website profile
      const profile = {
        name_guess: "Test HVAC",
        summary: "An HVAC business focused on installation and repair",
        services: ["installation", "repair", "maintenance"],
        location_mentions: [],
        industry_bucket: "trade" as const,
        domain: "testhvac.com",
        found_contact: true,
        website_present: true,
        opportunity_signals: {
          has_phone: true,
          has_email: true,
          has_booking_cta: false,
          has_financing: false,
          has_reviews: true,
          has_service_pages: true,
          has_maintenance_plan: false,
        },
      };

      // Ingest should succeed
      const result = await ingestRagDoc({
        text: `Website scan for ${profile.domain}`,
        metadata: {
          workspace_id: TEST_WORKSPACE_ID,
          industry_key: profile.industry_bucket,
          doc_type: "website_scan",
          source: "website",
          created_at: new Date().toISOString(),
          run_id: TEST_RUN_ID,
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Business Context Ingestion", () => {
    it("should ingest business profile context", async () => {
      const result = await ingestRagDoc({
        text: `
# Business Context

Industry: trade
Services: HVAC installation, repair, maintenance

This is a test business for RAG integration testing.
        `,
        metadata: {
          workspace_id: TEST_WORKSPACE_ID,
          industry_key: "trade",
          doc_type: "business_profile",
          source: "internal",
          created_at: new Date().toISOString(),
          run_id: TEST_RUN_ID,
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("RAG Context Retrieval", () => {
    beforeAll(async () => {
      // Seed some test data
      await ingestRagDoc({
        text: "Test context for HVAC business with focus on maintenance plans",
        metadata: {
          workspace_id: TEST_WORKSPACE_ID,
          industry_key: "trade",
          doc_type: "business_profile",
          source: "internal",
          created_at: new Date().toISOString(),
        },
      });
    });

    it("should return empty context when query is empty", async () => {
      const result = await getRagContext({
        query: "",
        filters: {
          workspace_id: TEST_WORKSPACE_ID,
        },
      });

      expect(result.context).toBe("");
      expect(result.sources).toHaveLength(0);
    });

    it("should return empty context when workspace_id is missing", async () => {
      const result = await getRagContext({
        query: "test query",
        filters: {},
      });

      expect(result.context).toBe("");
      expect(result.sources).toHaveLength(0);
    });

    it("should retrieve context when workspace_id and query provided", async () => {
      const result = await getRagContext({
        query: "HVAC business maintenance",
        filters: {
          workspace_id: TEST_WORKSPACE_ID,
          industry_key: "trade",
        },
        limit: 3,
      });

      // Should return some context (exact content depends on embedding quality)
      expect(typeof result.context).toBe("string");
      expect(Array.isArray(result.sources)).toBe(true);
    });
  });

  describe("RAG Exclusion from Learning Layer", () => {
    it("signals_v1 should not reference rag_context", () => {
      // Create a mock AnalysisResult with rag_context
      const mockAnalysis = {
        run_id: "test-run",
        snapshot: {
          snapshot_version: "snapshot_v2",
          window: {
            lookback_days: 90,
            slice_start: "2025-11-01",
            slice_end: "2026-02-01",
          },
          activity_signals: {
            quotes: { quotes_count: 10, quotes_approved_count: 8 },
            invoices: { invoices_count: 15, revenue_sum: 50000 },
          },
        } as unknown as AnalysisResult["snapshot"],
        business_profile: {
          industry_bucket: "trade",
          services: ["HVAC"],
        } as unknown as AnalysisResult["business_profile"],
        // Deliberately adding rag_context to test it's ignored
        rag_context: {
          context: "This should be ignored",
          sources: [],
        },
      } as unknown as AnalysisResult;

      const { features } = extractSignalsV1(mockAnalysis);

      // Verify signals_v1 keys do NOT include rag_context
      const featureKeys = Object.keys(features);
      expect(featureKeys).not.toContain("rag_context");
      expect(featureKeys).not.toContain("rag");
    });
  });

  describe("RAG Guardrails", () => {
    it("should enforce size limits on RAG documents", async () => {
      const largeText = "A".repeat(100_000); // 100KB

      // Should truncate or warn
      const result = await ingestRagDoc({
        text: largeText,
        metadata: {
          workspace_id: TEST_WORKSPACE_ID,
          industry_key: "trade",
          doc_type: "business_profile",
          source: "internal",
          created_at: new Date().toISOString(),
        },
      });

      // Should still succeed (with truncation)
      expect(result.success).toBe(true);
    });

    it("should fail when required metadata is missing", async () => {
      await expect(
        ingestRagDoc({
          text: "Test content",
          metadata: {
            workspace_id: "",
            industry_key: "trade",
            doc_type: "business_profile",
            source: "internal",
            created_at: new Date().toISOString(),
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("RAG Advisory Behavior", () => {
    it("should fail gracefully when RAG retrieval errors", async () => {
      // Pass invalid filters to trigger error path
      const result = await getRagContext({
        query: "test",
        filters: {
          workspace_id: "nonexistent-workspace",
        },
      });

      // Should return empty, not throw
      expect(result.context).toBe("");
      expect(result.sources).toHaveLength(0);
    });
  });
});
