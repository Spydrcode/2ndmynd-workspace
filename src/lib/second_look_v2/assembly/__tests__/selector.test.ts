import { describe, expect, it } from "vitest";

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";

import { selectModules } from "../selector";
import type { SecondLookIntakeV2 } from "../../contracts/second_look_intake_v2";

const baseIntake: SecondLookIntakeV2 = {
  business_name: "Test Business",
  snapshot_window: { mode: "last_90_days" },
  owner_values_top3: ["reliability_ontime", "team_stability"],
  pressure_sources_top2: ["scheduling_dispatch", "team_hiring_training"],
  emyth_role_split: "mixed",
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
    sample_confidence: "high",
    window_type: "last_90_days",
  },
  exclusions: {
    quotes_outside_window_count: 0,
    invoices_outside_window_count: 0,
    calendar_outside_window_count: 0,
  },
  weekly_volume_series: [{ week_start: "2025-12-01", quotes: 12, invoices: 9 }],
  invoice_size_buckets: [{ bucket: "small", count: 20 }],
  quote_age_buckets: [{ bucket: "1_7_days", count: 18 }],
  activity_signals: {
    quotes: {
      quotes_count: 68,
      quotes_approved_count: 40,
      approval_rate_band: "medium",
      decision_lag_band: "medium",
      quote_total_bands: { small: 20, medium: 30, large: 18 },
    },
    invoices: {
      invoices_count: 55,
      invoices_paid_count: 39,
      invoice_total_bands: { small: 18, medium: 22, large: 15 },
      payment_lag_band_distribution: {
        very_low: 4,
        low: 12,
        medium: 20,
        high: 10,
        very_high: 9,
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

describe("selectModules", () => {
  it("always includes emyth, porter, constructive, and blue ocean with max 6", () => {
    const modules = selectModules(baseIntake, { snapshot, layer_fusion: null });
    const ids = modules.map((module) => module.module_id);

    expect(ids).toContain("emyth_role_relief");
    expect(ids).toContain("porter_value_chain");
    expect(ids).toContain("constructive_installs");
    expect(ids).toContain("blue_ocean_errc");
    expect(modules.length).toBeLessThanOrEqual(6);
  });

  it("selects safety + customer comms for diamondback-like intake", () => {
    const intake: SecondLookIntakeV2 = {
      ...baseIntake,
      owner_values_top3: ["safety_compliance", "customer_communication", "reliability_ontime"],
      pressure_sources_top2: ["compliance_risk", "tools_message_overload"],
      emyth_role_split: "technician",
    };

    const modules = selectModules(intake, { snapshot, layer_fusion: null });
    const ids = modules.map((module) => module.module_id);

    expect(ids).toContain("safety_risk_protocols");
    expect(ids).toContain("customer_comms_system");

    const blue = modules.find((module) => module.module_id === "blue_ocean_errc");
    expect(blue?.variant).toBe("compressed");
    expect(modules.length).toBeLessThanOrEqual(6);
  });
});
