import { describe, expect, it } from "vitest";

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { BenchmarkPackV1 } from "../../types/decision_artifact";
import { buildPressureAction } from "../pressure_action_engine";

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
    quotes_outside_window_count: 0,
    invoices_outside_window_count: 0,
    calendar_outside_window_count: 0,
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
    { bucket: "8-14d", count: 2 },
    { bucket: "15-30d", count: 3 },
    { bucket: "30d+", count: 2 },
  ],
  invoice_size_buckets: [],
  weekly_volume_series: [],
  volatility_band: "medium",
  season: { phase: "Active", strength: "moderate", predictability: "medium" },
  input_costs: [],
};

const benchmarks: BenchmarkPackV1 = {
  cohort_id: "home_services_us_2024",
  cohort_label: "Home Services",
  version: "v1",
  metrics: [
    {
      key: "revenue_concentration_top5_share",
      label: "Revenue concentration",
      unit: "%",
      value: 73,
      peer_median: 42,
      percentile: 82,
      direction: "higher_is_risk",
    },
  ],
};

describe("pressure action engine", () => {
  it("includes numeric targets when benchmarks exist", () => {
    const result = buildPressureAction({
      pressure_key: "concentration_risk",
      snapshot: baseSnapshot,
      benchmarks,
      industry_group: "home_services_trade",
      industry_key: "hvac",
    });

    expect(result.recommended_move).toContain("peer median");
    expect(result.recommended_move).toMatch(/\d/);
  });

  it("degrades safely when metrics are missing", () => {
    const sparseSnapshot: SnapshotV2 = {
      ...baseSnapshot,
      activity_signals: {
        ...baseSnapshot.activity_signals,
        quotes: {
          ...baseSnapshot.activity_signals.quotes,
          quotes_count: 0,
          quotes_approved_count: 0,
        },
      },
      quote_age_buckets: [],
    };

    const result = buildPressureAction({
      pressure_key: "low_conversion",
      snapshot: sparseSnapshot,
      benchmarks: undefined,
      industry_group: "home_services_trade",
    });

    expect(result.action_degraded_missing_metric).toBe(true);
    expect(result.recommended_move).not.toMatch(/\d/);
  });

  it("uses mid-ticket lane language for HVAC concentration risk", () => {
    const result = buildPressureAction({
      pressure_key: "concentration_risk",
      snapshot: baseSnapshot,
      benchmarks,
      industry_group: "home_services_trade",
      industry_key: "hvac",
    });

    expect(result.recommended_move.toLowerCase()).toContain("mid-ticket");
  });

  it("uses prep/throughput language for taco stand capacity pressure", () => {
    const result = buildPressureAction({
      pressure_key: "capacity_pressure",
      snapshot: baseSnapshot,
      benchmarks: undefined,
      industry_group: "food_mobile",
      industry_key: "taco_stand",
    });

    expect(result.recommended_move.toLowerCase()).toContain("prep");
  });
});
