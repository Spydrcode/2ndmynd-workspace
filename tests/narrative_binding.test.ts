/**
 * Unit tests for narrative binding with benchmarks
 */

import { describe, it, expect } from "vitest";
import { presentArtifact } from "@/lib/decision/v2/present";
import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { BenchmarkResult } from "@/src/lib/benchmarks/types";
import type { LayerFusionResult } from "@/src/lib/intelligence/layer_fusion/types";

describe("Narrative Binding with Benchmarks", () => {
  const mockSnapshot: SnapshotV2 = {
    snapshot_version: "snapshot_v2",
    pii_scrubbed: true,
    window: {
      slice_start: "2026-01-01",
      slice_end: "2026-02-03",
      report_date: "2026-02-03",
      lookback_days: 90,
      sample_confidence: "high",
      window_type: "last_90_days",
    },
    activity_signals: {
      quotes: {
        quotes_count: 23,
        quotes_approved_count: 18,
        approval_rate_band: "medium",
        decision_lag_band: "low",
        quote_total_bands: { small: 8, medium: 10, large: 5 },
      },
      invoices: {
        invoices_count: 45,
        invoices_paid_count: 38,
        invoice_total_bands: { small: 15, medium: 20, large: 10 },
        payment_lag_band_distribution: {
          very_low: 8,
          low: 15,
          medium: 12,
          high: 8,
          very_high: 2,
        },
      },
    },
    volatility_band: "medium",
    season: {
      phase: "Active",
      strength: "moderate",
      predictability: "medium",
    },
    input_costs: [],
  };

  const mockBenchmarks: BenchmarkResult = {
    cohort_id: "trades_hvac_service",
    cohort_label: "HVAC & trades (service)",
    benchmark_version: "v1.0.0",
    computed_at: "2026-02-03T10:00:00Z",
    metrics: {
      revenue_concentration_top5_share: {
        value: 0.35,
        peer_median: 0.25,
        peer_p25: 0.15,
        peer_p75: 0.40,
        percentile: 67,
        directionality: "lower_is_better",
        interpretation_hint: "Revenue concentration is near typical",
      },
      invoice_size_distribution_gini: {
        value: 0.50,
        peer_median: 0.45,
        peer_p25: 0.35,
        peer_p75: 0.60,
        percentile: 55,
        directionality: "lower_is_better",
        interpretation_hint: "Invoice size variance is near typical",
      },
      quote_age_over_14d_share: {
        value: 0.42,
        peer_median: 0.30,
        peer_p25: 0.15,
        peer_p75: 0.50,
        percentile: 72,
        directionality: "lower_is_better",
        interpretation_hint: "Quote follow-up lag is higher than most peers (review)",
      },
      approved_to_scheduled_p50_days: {
        value: 5.2,
        peer_median: 5.0,
        peer_p25: 2.0,
        peer_p75: 10.0,
        percentile: 52,
        directionality: "lower_is_better",
        interpretation_hint: "Approved → scheduled time is near typical",
      },
      invoiced_to_paid_p50_days: {
        value: 21.5,
        peer_median: 21.0,
        peer_p25: 14.0,
        peer_p75: 35.0,
        percentile: 51,
        directionality: "lower_is_better",
        interpretation_hint: "Cash collection time is near typical",
      },
      weekly_volume_volatility_index: {
        value: 0.38,
        peer_median: 0.35,
        peer_p25: 0.20,
        peer_p75: 0.55,
        percentile: 54,
        directionality: "lower_is_better",
        interpretation_hint: "Volume rhythm consistency is near typical",
      },
    },
  };

  const mockLayerFusion: LayerFusionResult = {
    computed_at: "2026-02-03T10:00:00Z",
    lookback_days: 90,
    coverage: {
      intent: true,
      billing: true,
      capacity: true,
      cash: true,
      cost: false,
      crm: false,
    },
    linkage: {
      linkage_weak: false,
      quote_to_invoice_match_rate: 0.85,
    },
    timing: {
      approved_to_scheduled_p50_days: 5.2,
      invoiced_to_paid_p50_days: 21.5,
    },
    pressure_patterns: [
      {
        id: "followup_drift",
        severity: "medium",
        statement: "Quote follow-up is drifting beyond 14 days for nearly half of open estimates.",
        evidence: ["42% of quotes are over 14 days old"],
        percentile: 72,
      },
    ],
    recommended_focus: "follow_up",
    warnings: [],
    summary: {
      quotes_recognized: 23,
      invoices_recognized: 45,
      calendar_recognized: 12,
    },
  };

  it("should include benchmark comparison in takeaway", () => {
    const presented = presentArtifact({
      run_id: "test-run-1",
      created_at: "2026-02-03T10:00:00Z",
      mode: "live",
      artifact: {
        conclusion: null,
        snapshot: mockSnapshot,
        input_health: {
          date_range: "Jan 1 - Feb 3, 2026",
          records_count: 68,
          coverage_warnings: [],
        },
        readiness_level: "ready",
        layer_fusion: mockLayerFusion,
        benchmarks: mockBenchmarks,
      },
    });

    // Takeaway should include benchmark comparison
    expect(presented.takeaway).toBeDefined();
    expect(presented.takeaway.length).toBeGreaterThan(50);
    // Should mention the pressure pattern
    expect(presented.takeaway.toLowerCase()).toContain("quote");
  });

  it("should include business-specific units in narrative", () => {
    const presented = presentArtifact({
      run_id: "test-run-2",
      created_at: "2026-02-03T10:00:00Z",
      mode: "live",
      artifact: {
        conclusion: null,
        snapshot: mockSnapshot,
        input_health: {
          date_range: "Jan 1 - Feb 3, 2026",
          records_count: 68,
          coverage_warnings: [],
        },
        readiness_level: "ready",
        layer_fusion: mockLayerFusion,
        benchmarks: mockBenchmarks,
      },
    });

    // Should use specific units (days, %, etc) not just "High" labels
    const hasSpecificUnits =
      presented.takeaway.includes("days") ||
      presented.takeaway.includes("%") ||
      presented.takeaway.includes("percentile");
    
    expect(hasSpecificUnits).toBe(true);
  });

  it("should populate pressure map with benchmark data", () => {
    const presented = presentArtifact({
      run_id: "test-run-3",
      created_at: "2026-02-03T10:00:00Z",
      mode: "live",
      artifact: {
        conclusion: null,
        snapshot: mockSnapshot,
        input_health: {
          date_range: "Jan 1 - Feb 3, 2026",
          records_count: 68,
          coverage_warnings: [],
        },
        readiness_level: "ready",
        layer_fusion: mockLayerFusion,
        benchmarks: mockBenchmarks,
      },
    });

    expect(presented.pressure_map).toBeDefined();
    expect(presented.pressure_map?.length).toBeGreaterThan(0);
    expect(presented.pressure_map?.[0].percentile).toBe(72);
  });

  it("should include benchmark display with cohort label", () => {
    const presented = presentArtifact({
      run_id: "test-run-4",
      created_at: "2026-02-03T10:00:00Z",
      mode: "live",
      artifact: {
        conclusion: null,
        snapshot: mockSnapshot,
        input_health: {
          date_range: "Jan 1 - Feb 3, 2026",
          records_count: 68,
          coverage_warnings: [],
        },
        readiness_level: "ready",
        layer_fusion: mockLayerFusion,
        benchmarks: mockBenchmarks,
      },
    });

    expect(presented.benchmarks).toBeDefined();
    expect(presented.benchmarks?.cohort_label).toBe("HVAC & trades (service)");
    expect(presented.benchmarks?.top_signals.length).toBeGreaterThan(0);
  });

  it("should set boundary when mapping confidence is low", () => {
    const presented = presentArtifact({
      run_id: "test-run-5",
      created_at: "2026-02-03T10:00:00Z",
      mode: "live",
      artifact: {
        conclusion: null,
        snapshot: mockSnapshot,
        input_health: {
          date_range: "Jan 1 - Feb 3, 2026",
          records_count: 68,
          coverage_warnings: [],
        },
        readiness_level: "ready",
        layer_fusion: mockLayerFusion,
        benchmarks: mockBenchmarks,
        mapping_confidence: "low",
      },
    });

    expect(presented.boundary).toBeDefined();
    expect(presented.boundary?.toLowerCase()).toContain("mapping");
  });

  it("should handle missing benchmarks gracefully", () => {
    const presented = presentArtifact({
      run_id: "test-run-6",
      created_at: "2026-02-03T10:00:00Z",
      mode: "live",
      artifact: {
        conclusion: null,
        snapshot: mockSnapshot,
        input_health: {
          date_range: "Jan 1 - Feb 3, 2026",
          records_count: 68,
          coverage_warnings: [],
        },
        readiness_level: "ready",
        layer_fusion: mockLayerFusion,
        benchmarks: null,
      },
    });

    expect(presented.takeaway).toBeDefined();
    expect(presented.benchmarks).toBeUndefined();
    // Should still work without benchmarks
    expect(presented.takeaway).toBe(mockLayerFusion.pressure_patterns[0].statement);
  });
});
