import { describe, expect, it } from "vitest";

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { LayerFusionResult } from "@/lib/intelligence/layer_fusion/types";
import type { BenchmarkResult } from "@/lib/benchmarks/types";
import { buildDecisionArtifact } from "../build_decision_artifact";

const baseSnapshot: SnapshotV2 = {
  snapshot_version: "snapshot_v2",
  pii_scrubbed: true,
  window: {
    slice_start: "2025-01-01",
    slice_end: "2025-03-31",
    report_date: "2025-03-31",
    lookback_days: 90,
    sample_confidence: "high",
    window_type: "last_90_days",
  },
  exclusions: {
    quotes_outside_window_count: 3,
    invoices_outside_window_count: 2,
    calendar_outside_window_count: 1,
  },
  activity_signals: {
    quotes: {
      quotes_count: 12,
      quotes_approved_count: 6,
      approval_rate_band: "medium",
      decision_lag_band: "medium",
      quote_total_bands: { small: 4, medium: 4, large: 4 },
    },
    invoices: {
      invoices_count: 10,
      invoices_paid_count: 5,
      invoice_total_bands: { small: 4, medium: 4, large: 2 },
      payment_lag_band_distribution: {
        very_low: 0,
        low: 2,
        medium: 3,
        high: 3,
        very_high: 2,
      },
    },
  },
  quote_age_buckets: [
    { bucket: "0-2d", count: 2 },
    { bucket: "3-7d", count: 3 },
    { bucket: "8-14d", count: 1 },
    { bucket: "15-30d", count: 4 },
    { bucket: "30d+", count: 2 },
  ],
  invoice_size_buckets: [
    { bucket: "<250", count: 2 },
    { bucket: "250-500", count: 2 },
    { bucket: "500-1k", count: 3 },
    { bucket: "1k-2k", count: 2 },
    { bucket: "2k+", count: 1 },
  ],
  weekly_volume_series: [],
  volatility_band: "medium",
  season: { phase: "Active", strength: "moderate", predictability: "medium" },
  input_costs: [],
};

describe("buildDecisionArtifact", () => {
  it("includes a quantified takeaway when counts exist", () => {
    const artifact = buildDecisionArtifact({
      snapshot: baseSnapshot,
      business_profile: null,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
      benchmarks: null,
    });

    expect(artifact.takeaway).toMatch(/\d/);
  });

  it("maps excluded counts from snapshot exclusions", () => {
    const artifact = buildDecisionArtifact({
      snapshot: baseSnapshot,
      business_profile: null,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
      benchmarks: null,
    });

    expect(artifact.window.excluded_counts.quotes_outside_window).toBe(3);
    expect(artifact.window.excluded_counts.invoices_outside_window).toBe(2);
    expect(artifact.window.excluded_counts.calendar_outside_window).toBe(1);
  });

  it("binds benchmark numbers into takeaway when available", () => {
    const benchmarks: BenchmarkResult = {
      cohort_id: "home_services_us_2024",
      cohort_label: "Home Services",
      benchmark_version: "v1",
      computed_at: "2024-12-31T00:00:00Z",
      metrics: {
        revenue_concentration_top5_share: {
          value: 73,
          peer_median: 42,
          peer_p25: 35,
          peer_p75: 50,
          percentile: 82,
          directionality: "lower_is_better",
          interpretation_hint: "Lower concentration is better",
        },
        quote_age_over_14d_share: {
          value: 38,
          peer_median: 22,
          peer_p25: 15,
          peer_p75: 30,
          percentile: 71,
          directionality: "lower_is_better",
          interpretation_hint: "Lower quote age is better",
        },
        invoice_size_distribution_gini: {
          value: 0.45,
          peer_median: 0.35,
          peer_p25: 0.25,
          peer_p75: 0.40,
          percentile: 70,
          directionality: "lower_is_better",
          interpretation_hint: "Lower Gini is better",
        },
        approved_to_scheduled_p50_days: {
          value: 5,
          peer_median: 3,
          peer_p25: 2,
          peer_p75: 4,
          percentile: 75,
          directionality: "lower_is_better",
          interpretation_hint: "Lower days is better",
        },
        invoiced_to_paid_p50_days: {
          value: 20,
          peer_median: 15,
          peer_p25: 10,
          peer_p75: 20,
          percentile: 50,
          directionality: "lower_is_better",
          interpretation_hint: "Lower days is better",
        },
        weekly_volume_volatility_index: {
          value: 0.3,
          peer_median: 0.25,
          peer_p25: 0.20,
          peer_p75: 0.30,
          percentile: 60,
          directionality: "lower_is_better",
          interpretation_hint: "Lower volatility is better",
        },
      },
    };

    const layer_fusion: LayerFusionResult = {
      computed_at: "2024-12-31T00:00:00Z",
      lookback_days: 365,
      coverage: { intent: true, billing: true, capacity: false, cash: false, cost: false, crm: false },
      linkage: { linkage_weak: false },
      timing: {},
      pressure_patterns: [
        {
          id: "concentration_risk",
          severity: "high",
          statement: "Revenue concentration high",
          evidence: [],
        },
      ],
      recommended_focus: "pricing",
      warnings: [],
      summary: { quotes_recognized: 100, invoices_recognized: 50, calendar_recognized: 0 },
    };

    const artifact = buildDecisionArtifact({
      snapshot: baseSnapshot,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      business_profile: { industry_bucket: "service", services: [] } as any,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
      benchmarks,
      layer_fusion,
    });

    // Takeaway should contain value, peer median, and percentile
    expect(artifact.takeaway).toMatch(/73%/);
    expect(artifact.takeaway).toMatch(/42%/);
    expect(artifact.takeaway).toMatch(/82/);
  });

  it("includes industry anchor in why_heavy even without industry_key", () => {
    const benchmarks: BenchmarkResult = {
      cohort_id: "home_services_us_2024",
      cohort_label: "Home Services",
      benchmark_version: "v1",
      computed_at: "2024-12-31T00:00:00Z",
      metrics: {
        quote_age_over_14d_share: {
          value: 38,
          peer_median: 22,
          peer_p25: 15,
          peer_p75: 30,
          percentile: 71,
          directionality: "lower_is_better",
          interpretation_hint: "Lower quote age is better",
        },
        invoice_size_distribution_gini: {
          value: 0.45,
          peer_median: 0.35,
          peer_p25: 0.25,
          peer_p75: 0.40,
          percentile: 70,
          directionality: "lower_is_better",
          interpretation_hint: "Lower Gini is better",
        },
        revenue_concentration_top5_share: {
          value: 0.5,
          peer_median: 0.4,
          peer_p25: 0.3,
          peer_p75: 0.5,
          percentile: 60,
          directionality: "lower_is_better",
          interpretation_hint: "Lower is better",
        },
        approved_to_scheduled_p50_days: {
          value: 5,
          peer_median: 3,
          peer_p25: 2,
          peer_p75: 4,
          percentile: 75,
          directionality: "lower_is_better",
          interpretation_hint: "Lower days is better",
        },
        invoiced_to_paid_p50_days: {
          value: 20,
          peer_median: 15,
          peer_p25: 10,
          peer_p75: 20,
          percentile: 50,
          directionality: "lower_is_better",
          interpretation_hint: "Lower days is better",
        },
        weekly_volume_volatility_index: {
          value: 0.3,
          peer_median: 0.25,
          peer_p25: 0.20,
          peer_p75: 0.30,
          percentile: 60,
          directionality: "lower_is_better",
          interpretation_hint: "Lower volatility is better",
        },
      },
    };

    const layer_fusion: LayerFusionResult = {
      computed_at: "2024-12-31T00:00:00Z",
      lookback_days: 365,
      coverage: { intent: true, billing: true, capacity: false, cash: false, cost: false, crm: false },
      linkage: { linkage_weak: false },
      timing: {},
      pressure_patterns: [
        {
          id: "followup_drift",
          severity: "high",
          statement: "Quote follow-up lag detected",
          evidence: [],
        },
      ],
      recommended_focus: "follow_up",
      warnings: [],
      summary: { quotes_recognized: 100, invoices_recognized: 50, calendar_recognized: 0 },
    };

    const artifact = buildDecisionArtifact({
      snapshot: baseSnapshot,
      business_profile: null, // No industry_key
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
      benchmarks,
      layer_fusion,
    });

    // why_heavy should contain industry anchor sentence
    expect(artifact.why_heavy).toMatch(/In home services|In professional services|In sales-led businesses/i);
  });

  it("binds real numbers into next_7_days actions", () => {
    const benchmarks: BenchmarkResult = {
      cohort_id: "home_services_us_2024",
      cohort_label: "Home Services",
      benchmark_version: "v1",
      computed_at: "2024-12-31T00:00:00Z",
      metrics: {
        quote_age_over_14d_share: {
          value: 38,
          peer_median: 22,
          peer_p25: 15,
          peer_p75: 30,
          percentile: 71,
          directionality: "lower_is_better",
          interpretation_hint: "Lower quote age is better",
        },
        invoice_size_distribution_gini: {
          value: 0.45,
          peer_median: 0.35,
          peer_p25: 0.25,
          peer_p75: 0.40,
          percentile: 70,
          directionality: "lower_is_better",
          interpretation_hint: "Lower Gini is better",
        },
        revenue_concentration_top5_share: {
          value: 0.5,
          peer_median: 0.4,
          peer_p25: 0.3,
          peer_p75: 0.5,
          percentile: 60,
          directionality: "lower_is_better",
          interpretation_hint: "Lower is better",
        },
        approved_to_scheduled_p50_days: {
          value: 5,
          peer_median: 3,
          peer_p25: 2,
          peer_p75: 4,
          percentile: 75,
          directionality: "lower_is_better",
          interpretation_hint: "Lower days is better",
        },
        invoiced_to_paid_p50_days: {
          value: 20,
          peer_median: 15,
          peer_p25: 10,
          peer_p75: 20,
          percentile: 50,
          directionality: "lower_is_better",
          interpretation_hint: "Lower days is better",
        },
        weekly_volume_volatility_index: {
          value: 0.3,
          peer_median: 0.25,
          peer_p25: 0.20,
          peer_p75: 0.30,
          percentile: 60,
          directionality: "lower_is_better",
          interpretation_hint: "Lower volatility is better",
        },
      },
    };

    const layer_fusion: LayerFusionResult = {
      computed_at: "2024-12-31T00:00:00Z",
      lookback_days: 365,
      coverage: { intent: true, billing: true, capacity: false, cash: false, cost: false, crm: false },
      linkage: { linkage_weak: false },
      timing: {},
      pressure_patterns: [
        {
          id: "followup_drift",
          severity: "high",
          statement: "Quote follow-up lag detected",
          evidence: [],
        },
      ],
      recommended_focus: "follow_up",
      warnings: [],
      summary: { quotes_recognized: 100, invoices_recognized: 50, calendar_recognized: 0 },
    };

    const artifact = buildDecisionArtifact({
      snapshot: baseSnapshot,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      business_profile: { industry_bucket: "service", services: [] } as any,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
      benchmarks,
      layer_fusion,
    });

    // At least one action should contain a number (38% or similar)
    const hasNumber = artifact.next_7_days.some((action) => /\d+%|\d+ days/.test(action));
    expect(hasNumber).toBe(true);
  });

  it("does not break schema - returns same structure", () => {
    const artifact = buildDecisionArtifact({
      snapshot: baseSnapshot,
      business_profile: null,
      readiness_level: "ready",
      diagnose_mode: false,
      mapping_confidence: "high",
      benchmarks: null,
    });

    // Verify all critical fields exist
    expect(artifact).toHaveProperty("version");
    expect(artifact).toHaveProperty("takeaway");
    expect(artifact).toHaveProperty("why_heavy");
    expect(artifact).toHaveProperty("next_7_days");
    expect(artifact).toHaveProperty("boundary");
    expect(artifact).toHaveProperty("window");
    expect(artifact).toHaveProperty("confidence");
    expect(artifact).toHaveProperty("pressure_map");
    expect(artifact).toHaveProperty("benchmarks");
    expect(artifact).toHaveProperty("evidence_summary");
    expect(artifact).toHaveProperty("visuals_summary");
    expect(artifact).toHaveProperty("website_opportunities");

    // Verify invariants (no exact key count - allows optional fields like cohort_context)
    expect(Array.isArray(artifact.next_7_days)).toBe(true);
    expect(artifact.next_7_days.length).toBeGreaterThan(0);
    expect(artifact.next_7_days.length).toBeLessThanOrEqual(7);
    
    expect(Array.isArray(artifact.pressure_map)).toBe(true);
    expect(artifact.pressure_map.length).toBeLessThanOrEqual(10);
    
    // Numeric fields must never be invented (should be null/undefined if absent)
    if (artifact.benchmarks?.metrics) {
      for (const metric of artifact.benchmarks.metrics) {
        expect(typeof metric.value === "number" || metric.value === null).toBe(true);
        expect(typeof metric.peer_median === "number" || metric.peer_median === null).toBe(true);
      }
    }
  });
});
