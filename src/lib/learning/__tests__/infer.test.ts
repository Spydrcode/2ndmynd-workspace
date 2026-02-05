import { describe, expect, it } from "vitest";

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { DecisionArtifactV1 } from "@/src/lib/types/decision_artifact";
import type { AnalysisResult } from "@/src/lib/intelligence/run_analysis";
import { createManifest } from "@/src/lib/intelligence/run_manifest";
import { applyLearningToDecisionArtifact } from "../infer";

const snapshot: SnapshotV2 = {
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
      quotes_count: 10,
      quotes_approved_count: 6,
      approval_rate_band: "medium",
      decision_lag_band: "medium",
      quote_total_bands: { small: 3, medium: 4, large: 3 },
    },
    invoices: {
      invoices_count: 8,
      invoices_paid_count: 4,
      invoice_total_bands: { small: 3, medium: 3, large: 2 },
      payment_lag_band_distribution: {
        very_low: 0,
        low: 2,
        medium: 2,
        high: 2,
        very_high: 2,
      },
    },
  },
  volatility_band: "medium",
  season: { phase: "Active", strength: "moderate", predictability: "medium" },
  input_costs: [],
};

const decisionArtifact: DecisionArtifactV1 = {
  version: "v1",
  takeaway: "Baseline takeaway.",
  why_heavy: "Baseline why.",
  next_7_days: ["Step 1"],
  boundary: "Baseline boundary.",
  window: {
    start_date: "2025-01-01",
    end_date: "2025-03-31",
    rule: "last_90_days",
    excluded_counts: { quotes_outside_window: 0, invoices_outside_window: 0, calendar_outside_window: 0 },
  },
  confidence: { level: "high", reason: "ok" },
  pressure_map: [
    {
      key: "follow_up_drift",
      label: "Follow up",
      sentence: "Follow-up drift detected.",
      recommended_move: "Do the thing.",
      boundary: "If seasonal, ignore.",
    },
  ],
};

const analysisResult: AnalysisResult = {
  run_id: "run_1",
  input_hash: "hash",
  snapshot,
  conclusion: null,
  validation: { ok: true, errors: [] },
  business_profile: {
    name_guess: null,
    summary: "HVAC service business",
    services: [],
    location_mentions: [],
    industry_bucket: "service",
    domain: null,
    found_contact: false,
    website_present: false,
    opportunity_signals: {
      has_phone: false,
      has_email: false,
      has_booking_cta: false,
      has_financing: false,
      has_reviews: false,
      has_service_pages: false,
      has_maintenance_plan: false,
    },
  },
  run_manifest: createManifest("run_1", "workspace", "mock"),
  decision_artifact: decisionArtifact,
} as AnalysisResult;

describe("learning inference notes", () => {
  it("attaches learning_note when overrides are applied", async () => {
    const result = await applyLearningToDecisionArtifact({
      analysis_result: analysisResult,
      decision_artifact: decisionArtifact,
      learned_outputs_override: {
        pressure_keys: ["follow_up_drift"],
        boundary_class: "confirm_mappings",
        model_versions: { pressure_selector: "v1", boundary_classifier: "v1" },
      },
    });

    expect(result.learning_note?.applied).toBe(true);
    expect(result.learning_note?.changes.length).toBeGreaterThan(0);
  });

  it("omits learning_note when inference is disabled", async () => {
    const result = await applyLearningToDecisionArtifact({
      analysis_result: analysisResult,
      decision_artifact: decisionArtifact,
      learned_outputs_override: null,
    });

    expect(result.learning_note).toBeUndefined();
  });
});
