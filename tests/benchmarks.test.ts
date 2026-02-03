/**
 * Unit tests for benchmark engine
 */

import { describe, it, expect } from "vitest";
import { computeBenchmarks } from "@/src/lib/benchmarks/benchmark_engine";
import { selectCohort } from "@/src/lib/benchmarks/cohorts";
import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";

describe("Benchmark Engine", () => {
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
        quotes_count: 45,
        quotes_approved_count: 30,
        approval_rate_band: "medium",
        decision_lag_band: "low",
        quote_total_bands: { small: 15, medium: 20, large: 10 },
      },
      invoices: {
        invoices_count: 38,
        invoices_paid_count: 30,
        invoice_total_bands: { small: 12, medium: 18, large: 8 },
        payment_lag_band_distribution: {
          very_low: 5,
          low: 10,
          medium: 10,
          high: 3,
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

  it("should select HVAC cohort for HVAC industry tags", () => {
    const cohort = selectCohort(["hvac", "service"]);
    expect(cohort.id).toBe("trades_hvac_service");
  });

  it("should select general service cohort for unknown tags", () => {
    const cohort = selectCohort(["unknown_industry"]);
    expect(cohort.id).toBe("general_service");
  });

  it("should compute benchmarks with valid inputs", () => {
    const result = computeBenchmarks({
      snapshot: mockSnapshot,
      industryTags: ["hvac"],
      invoiceTotals: [1000, 2000, 1500, 3000, 2500, 1200, 1800, 2200],
      weeklyInvoiceCounts: [5, 6, 4, 7, 5, 6, 5],
      quoteAges: [5, 10, 15, 20, 3, 8, 12, 18, 25, 7],
      approvedToScheduledDays: [3, 5, 7, 4, 6, 5, 4],
      invoicedToPaidDays: [18, 21, 25, 19, 22, 20],
    });

    expect(result.cohort_id).toBe("trades_hvac_service");
    expect(result.benchmark_version).toBe("v1.0.0");
    expect(result.metrics).toBeDefined();
    expect(result.metrics.approved_to_scheduled_p50_days).toBeDefined();
    expect(result.metrics.approved_to_scheduled_p50_days.percentile).toBeGreaterThanOrEqual(0);
    expect(result.metrics.approved_to_scheduled_p50_days.percentile).toBeLessThanOrEqual(100);
  });

  it("should handle empty inputs gracefully", () => {
    const result = computeBenchmarks({
      snapshot: mockSnapshot,
      industryTags: [],
      invoiceTotals: [],
      weeklyInvoiceCounts: [],
      quoteAges: [],
      approvedToScheduledDays: [],
      invoicedToPaidDays: [],
    });

    expect(result.cohort_id).toBe("general_service");
    expect(result.metrics.approved_to_scheduled_p50_days).toBeDefined();
    // Should use defaults when no data
    expect(result.metrics.approved_to_scheduled_p50_days.value).toBe(5);
  });

  it("should compute percentiles correctly for metrics", () => {
    const result = computeBenchmarks({
      snapshot: mockSnapshot,
      industryTags: ["hvac"],
      invoiceTotals: [1000, 2000, 1500],
      weeklyInvoiceCounts: [5, 6, 5, 6, 5],
      quoteAges: [3, 5, 7], // All under 14 days
      approvedToScheduledDays: [2, 3, 2], // Very fast
      invoicedToPaidDays: [14, 15, 16], // Very fast payments
    });

    // Fast approved-to-scheduled should be low percentile (good)
    expect(result.metrics.approved_to_scheduled_p50_days.percentile).toBeLessThan(50);
    expect(result.metrics.approved_to_scheduled_p50_days.directionality).toBe("lower_is_better");

    // Low quote age should be low percentile (good)
    expect(result.metrics.quote_age_over_14d_share.percentile).toBeLessThan(50);
  });

  it("should include interpretation hints", () => {
    const result = computeBenchmarks({
      snapshot: mockSnapshot,
      industryTags: ["hvac"],
      approvedToScheduledDays: [15, 16, 17], // Slow
    });

    const metric = result.metrics.approved_to_scheduled_p50_days;
    expect(metric.interpretation_hint).toContain("Approved → scheduled");
    expect(metric.interpretation_hint.length).toBeGreaterThan(10);
  });
});
