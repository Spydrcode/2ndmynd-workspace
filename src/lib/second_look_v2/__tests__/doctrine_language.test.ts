import { describe, expect, it } from "vitest";

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";

import { assembleSecondLookV2 } from "../assembly/assembler";
import type { SecondLookIntakeV2 } from "../contracts/second_look_intake_v2";

const BANNED_TOKENS = ["dashboard", "kpi", "benchmarks", "monitoring", "analytics", "bi", "scorecard"];

const intake: SecondLookIntakeV2 = {
  business_name: "Diamondback Propane",
  snapshot_window: { mode: "last_90_days" },
  owner_values_top3: ["safety_compliance", "customer_communication", "reliability_ontime"],
  pressure_sources_top2: ["compliance_risk", "tools_message_overload"],
  emyth_role_split: "technician",
  consent_flags: { data_ok: true },
};

const snapshot: SnapshotV2 = {
  snapshot_version: "snapshot_v2",
  pii_scrubbed: true,
  window: {
    slice_start: "2025-10-01",
    slice_end: "2025-12-30",
    report_date: "2025-12-31",
    lookback_days: 90,
    sample_confidence: "medium",
    window_type: "last_90_days",
  },
  exclusions: {
    quotes_outside_window_count: 0,
    invoices_outside_window_count: 0,
    calendar_outside_window_count: 0,
  },
  weekly_volume_series: [{ week_start: "2025-12-01", quotes: 14, invoices: 11 }],
  invoice_size_buckets: [{ bucket: "small", count: 12 }],
  quote_age_buckets: [{ bucket: "1_7_days", count: 10 }],
  activity_signals: {
    quotes: {
      quotes_count: 36,
      quotes_approved_count: 22,
      approval_rate_band: "medium",
      decision_lag_band: "high",
      quote_total_bands: { small: 12, medium: 16, large: 8 },
    },
    invoices: {
      invoices_count: 29,
      invoices_paid_count: 17,
      invoice_total_bands: { small: 11, medium: 10, large: 8 },
      payment_lag_band_distribution: {
        very_low: 3,
        low: 6,
        medium: 9,
        high: 6,
        very_high: 5,
      },
    },
  },
  volatility_band: "high",
  season: {
    phase: "Active",
    strength: "moderate",
    predictability: "low",
  },
  input_costs: [],
};

describe("Second Look doctrine language", () => {
  it("keeps banned language out and preserves finite artifact rules", () => {
    const artifact = assembleSecondLookV2({ intake, snapshot, layer_fusion: null });

    const fullText = JSON.stringify(artifact).toLowerCase();
    for (const token of BANNED_TOKENS) {
      const pattern = new RegExp(`\\b${token}\\b`, "i");
      expect(pattern.test(fullText)).toBe(false);
    }

    expect(artifact.modules.length).toBeLessThanOrEqual(6);
    expect(artifact.plan.actions_7_days.length).toBeLessThanOrEqual(7);
    expect(artifact.plan.actions_30_days.length).toBeLessThanOrEqual(7);

    const keys = Object.keys(artifact.decision_paths).sort();
    expect(keys).toEqual(["neither", "path_A", "path_B"]);
  });
});
