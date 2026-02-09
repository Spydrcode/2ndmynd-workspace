import type { SnapshotV2 } from "../../lib/decision/v2/conclusion_schema_v2";
import type { OwnerIntentIntake } from "../../src/lib/types/intent_intake";

export const TEST_OWNER_INTENT_INTAKE: OwnerIntentIntake = {
  intake_version: "0.2",
  collected_at: "2026-01-01T00:00:00.000Z",
  value_prop_tags: ["clarity_communication", "local_trust"],
  priorities_ranked: ["predictability_stability", "customer_experience", "low_stress_owner"],
  non_negotiables: ["protect_reputation"],
  anti_goals: [],
  primary_constraint: "scheduling_chaos",
  success_90d: "A steadier week with fewer handoffs dropped.",
  context_notes: "Owner-led local services business.",
};

export const TEST_SNAPSHOT_V2: SnapshotV2 = {
  snapshot_version: "snapshot_v2",
  pii_scrubbed: true,
  window: {
    slice_start: "2025-11-01",
    slice_end: "2026-01-31",
    report_date: "2026-02-01",
    lookback_days: 90,
    sample_confidence: "high",
    window_type: "last_90_days",
  },
  activity_signals: {
    quotes: {
      quotes_count: 48,
      quotes_approved_count: 21,
      approval_rate_band: "medium",
      decision_lag_band: "high",
      quote_total_bands: { small: 15, medium: 24, large: 9 },
    },
    invoices: {
      invoices_count: 39,
      invoices_paid_count: 31,
      invoice_total_bands: { small: 14, medium: 18, large: 7 },
      payment_lag_band_distribution: {
        very_low: 0.08,
        low: 0.22,
        medium: 0.35,
        high: 0.23,
        very_high: 0.12,
      },
    },
  },
  volatility_band: "high",
  season: {
    phase: "Active",
    strength: "moderate",
    predictability: "medium",
  },
  input_costs: [],
};

export function withAdjustedSnapshot(
  patch: Partial<SnapshotV2["activity_signals"]>
): SnapshotV2 {
  return {
    ...TEST_SNAPSHOT_V2,
    activity_signals: {
      ...TEST_SNAPSHOT_V2.activity_signals,
      ...patch,
    },
  };
}
