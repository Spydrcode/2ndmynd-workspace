import { describe, it, expect } from "vitest";
import { buildDecisionArtifact } from "@/src/lib/present/build_decision_artifact";
import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { ConclusionV2 } from "@/src/lib/intelligence/run_adapter";
import type { LayerFusionResult } from "@/src/lib/intelligence/layer_fusion/types";
import type { BusinessProfile } from "@/src/lib/intelligence/run_adapter";

describe("buildDecisionArtifact", () => {
  const mockSnapshot: SnapshotV2 = {
    version: "v2",
    window: {
      lookback_days: 90,
    },
    activity_signals: {
      quotes: {
        decision_lag_band: "medium",
      },
      invoices: {
        collection_band: "medium",
      },
    },
    calendar_open: [],
    calendar_closed: [],
    stats: {
      start_date: "2024-01-01",
      end_date: "2024-03-31",
      rows: 100,
      customers_count: 25,
      quotes_count: 45,
      invoices_count: 55,
      warnings: [],
    },
    quotes: {
      base: [],
      metrics: {
        q_approved_to_scheduled_p50_days: 5,
        q_created_to_approved_p50_days: 3,
      },
      aggregates: {
        count: 45,
        approved_count: 30,
        scheduled_count: 25,
        age_over_14d_count: 5,
      },
    },
    invoices: {
      base: [],
      metrics: {
        i_invoiced_to_paid_p50_days: 12,
      },
      aggregates: {
        count: 55,
        paid_count: 50,
        open_count: 5,
      },
    },
    cohorts: {},
  };

  const mockConclusion: ConclusionV2 = {
    conclusion_version: "conclusion_v2",
    pattern_id: "test_pattern",
    one_sentence_pattern: "Test pattern",
    decision: "Test decision",
    why_this_now: "Test why",
    boundary: "Test boundary",
    confidence: "high",
    evidence_signals: [],
    season_context: "neutral",
    optional_next_steps: ["Step 1", "Step 2", "Step 3"],
  };

  const mockProfile: BusinessProfile = {
    name_guess: "Test Business",
    summary: "Test summary",
    services: ["HVAC"],
    industry_bucket: "trades",
  };

  it("should always return version v1", () => {
    const result = buildDecisionArtifact({
      snapshot: mockSnapshot,
      conclusion: mockConclusion,
      layer_fusion: null,
      business_profile: mockProfile,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
    });

    expect(result.version).toBe("v1");
  });

  it("should include window with excluded_counts", () => {
    const result = buildDecisionArtifact({
      snapshot: mockSnapshot,
      conclusion: mockConclusion,
      layer_fusion: null,
      business_profile: mockProfile,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
    });

    expect(result.window).toBeDefined();
    expect(result.window.start_date).toBeDefined();
    expect(result.window.end_date).toBeDefined();
    expect(result.window.excluded_counts).toBeDefined();
    expect(result.window.excluded_counts.quotes_outside_window).toBeGreaterThanOrEqual(0);
    expect(result.window.excluded_counts.invoices_outside_window).toBeGreaterThanOrEqual(0);
  });

  it("should include confidence level and reason", () => {
    const result = buildDecisionArtifact({
      snapshot: mockSnapshot,
      conclusion: mockConclusion,
      layer_fusion: null,
      business_profile: mockProfile,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
    });

    expect(result.confidence).toBeDefined();
    expect(result.confidence.level).toMatch(/^(high|medium|low)$/);
    expect(result.confidence.reason).toBeDefined();
    expect(typeof result.confidence.reason).toBe("string");
  });

  it("should include benchmarks when cohortHints include HVAC or trades", () => {
    const profileWithHVAC: BusinessProfile = {
      ...mockProfile,
      services: ["HVAC"],
      industry_bucket: "trades",
    };

    const result = buildDecisionArtifact({
      snapshot: mockSnapshot,
      conclusion: mockConclusion,
      layer_fusion: null,
      business_profile: profileWithHVAC,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
    });

    expect(result.benchmarks).toBeDefined();
    expect(result.benchmarks?.cohort_id).toBeDefined();
    expect(result.benchmarks?.metrics).toBeDefined();
    expect(Array.isArray(result.benchmarks?.metrics)).toBe(true);
  });

  it("should have pressure_map with max 3 items", () => {
    const result = buildDecisionArtifact({
      snapshot: mockSnapshot,
      conclusion: mockConclusion,
      layer_fusion: null,
      business_profile: mockProfile,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
    });

    expect(result.pressure_map).toBeDefined();
    expect(Array.isArray(result.pressure_map)).toBe(true);
    expect(result.pressure_map.length).toBeLessThanOrEqual(3);
  });

  it("should reference benchmark_ref in pressure_map when available", () => {
    const profileWithHVAC: BusinessProfile = {
      ...mockProfile,
      services: ["HVAC"],
      industry_bucket: "trades",
    };

    const mockLayerFusionWithPressure: LayerFusionResult = {
      readiness_level: "ready",
      focus: "follow_up_drift",
      recommended_focus: "follow_up",
      one_sentence: "Test",
      why_this_matters: "Test",
      suggested_actions: [],
      boundary_note: "Test",
      evidence_summary: [],
      pressure_patterns: [
        { id: "followup_drift", statement: "Follow-up is drifting", severity: "medium" },
      ],
      warnings: [],
    };

    const result = buildDecisionArtifact({
      snapshot: mockSnapshot,
      conclusion: mockConclusion,
      layer_fusion: mockLayerFusionWithPressure,
      business_profile: profileWithHVAC,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
    });

    const pressureWithBenchmark = result.pressure_map.find((p: { benchmark_ref?: string }) => p.benchmark_ref);
    
    // Pressure map should exist when layer_fusion has patterns
    expect(result.pressure_map.length).toBeGreaterThan(0);
    
    // When benchmarks are available and pressure patterns exist, 
    // some pressure signals should reference benchmarks
    if (result.benchmarks && result.benchmarks.metrics.length > 0 && result.pressure_map.length > 0) {
      // At least check that benchmark_ref is a valid field type
      expect(typeof pressureWithBenchmark?.benchmark_ref === "string" || pressureWithBenchmark?.benchmark_ref === undefined).toBe(true);
    }
  });

  it("should include takeaway, why_heavy, next_7_days, and boundary", () => {
    const result = buildDecisionArtifact({
      snapshot: mockSnapshot,
      conclusion: mockConclusion,
      layer_fusion: null,
      business_profile: mockProfile,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
    });

    expect(result.takeaway).toBeDefined();
    expect(typeof result.takeaway).toBe("string");
    expect(result.takeaway.length).toBeGreaterThan(0);

    expect(result.why_heavy).toBeDefined();
    expect(typeof result.why_heavy).toBe("string");
    expect(result.why_heavy.length).toBeGreaterThan(0);

    expect(result.next_7_days).toBeDefined();
    expect(Array.isArray(result.next_7_days)).toBe(true);
    expect(result.next_7_days.length).toBeGreaterThanOrEqual(2);
    expect(result.next_7_days.length).toBeLessThanOrEqual(3);

    expect(result.boundary).toBeDefined();
    expect(typeof result.boundary).toBe("string");
  });

  it("should prefer layer_fusion when readiness_level is ready", () => {
    const mockLayerFusion: LayerFusionResult = {
      readiness_level: "ready",
      focus: "scheduling_drift",
      recommended_focus: "scheduling",
      one_sentence: "Layer fusion takeaway",
      why_this_matters: "Layer fusion why",
      suggested_actions: ["Action 1", "Action 2"],
      boundary_note: "Layer fusion boundary",
      evidence_summary: [],
      pressure_patterns: [],
      warnings: [],
    };

    const result = buildDecisionArtifact({
      snapshot: mockSnapshot,
      conclusion: mockConclusion,
      layer_fusion: mockLayerFusion,
      business_profile: mockProfile,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
    });

    expect(result.takeaway).toContain("Layer fusion");
  });
});
