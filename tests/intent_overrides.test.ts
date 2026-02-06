/**
 * Intent Overrides / Confirmation Hooks Tests
 *
 * Tests the override application logic in the coherence engine.
 * DOCTRINE: No judgment language in any output.
 */

import { describe, it, expect } from "vitest";
import { runCoherenceEngineV3, type CoherenceEngineInputV3 } from "../src/lib/coherence/index_v3";
import type { OwnerIntentIntake, IntentOverrides } from "../src/lib/types/intent_intake";
import type { ComputedSignals } from "../mcp/tools/compute_signals_v2";
import type { SnapshotV2 } from "../lib/decision/v2/conclusion_schema_v2";

// ── Fixtures ──

const MOCK_INTAKE: OwnerIntentIntake = {
  intake_version: "0.2",
  collected_at: new Date().toISOString(),
  value_prop_tags: ["speed_responsiveness", "local_trust"],
  priorities_ranked: ["customer_experience", "predictability_stability", "reputation_trust"],
  non_negotiables: ["no_safety_compromise", "protect_reputation"],
  anti_goals: ["dont_scale_headcount"],
  primary_constraint: "scheduling_chaos",
  success_90d: "Steady income, good reputation, home by dinner",
  context_notes: "8 years in business, 2 employees",
};

const MOCK_SIGNALS: ComputedSignals = {
  seasonality_pattern: "moderate",
  seasonality_evidence: "Fall rises",
  volatility_band: "high",
  volatility_evidence: "Wide swings",
  approval_lag_signal: "High lag",
  payment_lag_signal: "Elevated",
  concentration_signals: [
    { source: "customer", concentration_pct: 68, risk_level: "high", description: "3 customers = 68%" },
  ],
  capacity_signals: [
    { signal_type: "demand_exceeds_capacity", severity: "high", evidence: "Overwhelmed" },
  ],
  owner_dependency: [
    { dependency_type: "approval_bottleneck", frequency: "frequent", impact: "Owner approves all" },
  ],
  business_type_hypothesis: "Residential contractor",
  confidence: "high",
  missing_data_flags: [],
};

const MOCK_SNAPSHOT: SnapshotV2 = {
  snapshot_version: "snapshot_v2",
  pii_scrubbed: true,
  window: {
    slice_start: "2024-01-01",
    slice_end: "2024-03-31",
    report_date: "2024-04-01",
    lookback_days: 90,
    sample_confidence: "high",
    window_type: "last_90_days",
  },
  activity_signals: {
    quotes: {
      quotes_count: 120,
      quotes_approved_count: 80,
      approval_rate_band: "medium",
      decision_lag_band: "high",
      quote_total_bands: { small: 40, medium: 60, large: 20 },
    },
    invoices: {
      invoices_count: 80,
      invoices_paid_count: 72,
      invoice_total_bands: { small: 20, medium: 40, large: 20 },
      payment_lag_band_distribution: {
        very_low: 0.1,
        low: 0.3,
        medium: 0.3,
        high: 0.2,
        very_high: 0.1,
      },
    },
  },
  volatility_band: "high",
  season: { phase: "Rising", strength: "moderate", predictability: "medium" },
  input_costs: [],
};

// ── Tests ──

describe("Intent Overrides", () => {
  it("should run v3 engine without overrides", () => {
    const input: CoherenceEngineInputV3 = {
      run_id: "test-no-overrides",
      intake: MOCK_INTAKE,
      computedSignals: MOCK_SIGNALS,
      snapshot: MOCK_SNAPSHOT,
    };

    const result = runCoherenceEngineV3(input);
    expect(result).toBeDefined();
    expect(result.value_prop_alignment.length).toBeGreaterThan(0);
  });

  it("should boost confidence when owner confirms a value", () => {
    const overrides: IntentOverrides = {
      run_id: "test-confirm",
      overrides: [
        {
          tag: "speed_responsiveness",
          confirmed: true,
          recorded_at: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
    };

    const input: CoherenceEngineInputV3 = {
      run_id: "test-confirm",
      intake: MOCK_INTAKE,
      computedSignals: MOCK_SIGNALS,
      snapshot: MOCK_SNAPSHOT,
      overrides,
    };

    const result = runCoherenceEngineV3(input);

    // The confirmed value should have high confidence on intent
    const speedConf = result.intent.value_confidence?.find(
      (vc) => vc.tag === "speed_responsiveness"
    );
    expect(speedConf?.confidence).toBe("high");
    expect(speedConf?.sources.declared).toBe(true);
  });

  it("should reduce priority when owner says value shifted", () => {
    const overrides: IntentOverrides = {
      run_id: "test-shift",
      overrides: [
        {
          tag: "speed_responsiveness",
          confirmed: false,
          recorded_at: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
    };

    const input: CoherenceEngineInputV3 = {
      run_id: "test-shift",
      intake: MOCK_INTAKE,
      computedSignals: MOCK_SIGNALS,
      snapshot: MOCK_SNAPSHOT,
      overrides,
    };

    const result = runCoherenceEngineV3(input);

    const speedConf = result.intent.value_confidence?.find(
      (vc) => vc.tag === "speed_responsiveness"
    );
    expect(speedConf?.score).toBe(0);
    expect(speedConf?.confidence).toBe("low");
  });

  it("should not affect unrelated values when override is applied", () => {
    const overrides: IntentOverrides = {
      run_id: "test-isolated",
      overrides: [
        {
          tag: "speed_responsiveness",
          confirmed: true,
          recorded_at: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
    };

    const withOverrides = runCoherenceEngineV3({
      run_id: "test-with",
      intake: MOCK_INTAKE,
      computedSignals: MOCK_SIGNALS,
      snapshot: MOCK_SNAPSHOT,
      overrides,
    });

    const without = runCoherenceEngineV3({
      run_id: "test-without",
      intake: MOCK_INTAKE,
      computedSignals: MOCK_SIGNALS,
      snapshot: MOCK_SNAPSHOT,
    });

    // local_trust should be unaffected
    const withLT = withOverrides.intent.value_confidence?.find((vc) => vc.tag === "local_trust");
    const withoutLT = without.intent.value_confidence?.find((vc) => vc.tag === "local_trust");

    expect(withLT?.confidence).toBe(withoutLT?.confidence);
    expect(withLT?.score).toBe(withoutLT?.score);
  });
});
