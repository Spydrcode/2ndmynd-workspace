import { describe, expect, it } from "vitest";

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";

import { assembleSecondLookV2 } from "../assembler";
import type { SecondLookIntakeV2 } from "../../contracts/second_look_intake_v2";
import type { LayerFusionResult } from "@/src/lib/intelligence/layer_fusion/types";

const intake: SecondLookIntakeV2 = {
  business_name: "Diamondback Propane",
  website_url: "https://diamondback.example",
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
  weekly_volume_series: [{ week_start: "2025-12-01", quotes: 10, invoices: 8 }],
  invoice_size_buckets: [{ bucket: "small", count: 16 }],
  quote_age_buckets: [{ bucket: "8_14_days", count: 9 }],
  activity_signals: {
    quotes: {
      quotes_count: 42,
      quotes_approved_count: 26,
      approval_rate_band: "medium",
      decision_lag_band: "high",
      quote_total_bands: { small: 15, medium: 17, large: 10 },
    },
    invoices: {
      invoices_count: 33,
      invoices_paid_count: 21,
      invoice_total_bands: { small: 13, medium: 11, large: 9 },
      payment_lag_band_distribution: {
        very_low: 2,
        low: 8,
        medium: 10,
        high: 7,
        very_high: 6,
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

const layerFusion: LayerFusionResult = {
  computed_at: "2026-02-09T10:00:00.000Z",
  lookback_days: 90,
  coverage: {
    intent: true,
    billing: true,
    capacity: true,
    cash: true,
    cost: false,
    crm: true,
  },
  linkage: {
    linkage_weak: false,
    quote_to_invoice_match_rate: 0.65,
  },
  timing: {
    approved_to_scheduled_p50_days: 5,
    invoiced_to_paid_p50_days: 22,
  },
  pressure_patterns: [
    {
      id: "capacity_pressure",
      severity: "high",
      statement: "Dispatch load spikes are creating escalation pressure.",
      evidence: ["weekly volatility", "approval lag", "rescheduling"],
      metric_ref: "approved_to_scheduled_p50_days",
      percentile: 82,
    },
  ],
  recommended_focus: "scheduling",
  warnings: ["calendar layer partial"],
  summary: {
    quotes_recognized: 42,
    invoices_recognized: 33,
    calendar_recognized: 20,
  },
};

describe("assembleSecondLookV2", () => {
  it("builds doctrine-shaped artifact with finite paths and plan", () => {
    const artifact = assembleSecondLookV2({
      intake,
      snapshot,
      layer_fusion: layerFusion,
      business_profile: {
        name_guess: "Diamondback",
        summary: "Propane delivery and maintenance services.",
        services: ["delivery", "tank checks"],
        location_mentions: ["TX"],
        industry_bucket: "field_services",
        domain: "diamondback.example",
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
      },
    });

    expect(artifact.decision_paths.path_A).toBeTruthy();
    expect(artifact.decision_paths.path_B).toBeTruthy();
    expect(typeof artifact.decision_paths.neither.copy).toBe("string");

    expect(artifact.modules.length).toBeLessThanOrEqual(6);
    expect(artifact.plan.boundaries.length).toBeLessThanOrEqual(3);
    expect(artifact.plan.actions_7_days.length).toBeLessThanOrEqual(7);
    expect(artifact.plan.actions_30_days.length).toBeLessThanOrEqual(7);

    const moduleIds = artifact.modules.map((module) => module.module_id);
    expect(moduleIds).toContain("safety_risk_protocols");
    expect(moduleIds).toContain("customer_comms_system");
  });
});
