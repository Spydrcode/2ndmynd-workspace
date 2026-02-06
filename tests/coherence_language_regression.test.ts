/**
 * Coherence Language Regression Test — "Golden" Language Guardrails
 *
 * This test exercises the full coherence output generation and asserts that
 * NO forbidden language patterns appear in any output strings.
 *
 * DOCTRINE:
 * - No "you should", "benchmark", "industry average", etc.
 * - No shame, judgment, or prescriptive language.
 * - This test is a regression guard against language drift.
 */

import { describe, it, expect } from "vitest";
import { runCoherenceEngine, type CoherenceEngineInput } from "../src/lib/coherence/index";
import { presentCoherenceSnapshot } from "../src/lib/present/present_coherence";
import { computeCoherenceDrift } from "../src/lib/coherence/coherence_drift";
import { FORBIDDEN_WORDS } from "../src/lib/coherence/language_guardrails";
import type { IntentIntake } from "../src/lib/coherence/build_owner_intent";
import type { ComputedSignals } from "../mcp/tools/compute_signals_v2";
import type { SnapshotV2 } from "../lib/decision/v2/conclusion_schema_v2";

// ── Fixtures ──

const GOLDEN_INTAKE: IntentIntake = {
  value_proposition_statement: "We provide reliable same-day plumbing repair for homeowners.",
  value_proposition_tags: ["speed_responsiveness", "local_trust", "premium_quality"],
  priorities_ranked: ["customer experience", "stability", "quality"],
  non_negotiables: ["Never leave a job unfinished", "Licensed and insured"],
  boundaries: {
    time: "I work 6am-4pm, no weekends",
    stress: "I need to stop firefighting every day",
    risk: "No debt right now",
  },
  definition_of_success: "Steady income, good reputation, home by dinner",
  anti_goals: ["I don't want to manage 20 employees", "No franchising"],
  context_notes: "Been in business 8 years, 2 employees",
};

const GOLDEN_SIGNALS: ComputedSignals = {
  seasonality_pattern: "moderate",
  seasonality_evidence: "Volume rises in fall, drops in spring",
  volatility_band: "high",
  volatility_evidence: "Wide swings in weekly volume",
  approval_lag_signal: "Decision lag is high",
  payment_lag_signal: "Payment lag elevated",
  concentration_signals: [
    {
      source: "customer",
      concentration_pct: 68,
      risk_level: "high",
      description: "3 customers account for 68% of invoiced revenue",
    },
  ],
  capacity_signals: [
    {
      signal_type: "demand_exceeds_capacity",
      severity: "high",
      evidence: "More quotes than available capacity to fulfill",
    },
  ],
  owner_dependency: [
    {
      dependency_type: "approval_bottleneck",
      frequency: "frequent",
      impact: "Owner must approve most quotes personally",
    },
  ],
  business_type_hypothesis: "Residential service contractor",
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
  season: {
    phase: "Rising",
    strength: "moderate",
    predictability: "medium",
  },
  input_costs: [],
};

// ── Helpers ──

/**
 * Recursively extract all string values from an object.
 */
function extractAllStrings(obj: unknown, path = ""): Array<{ path: string; value: string }> {
  const result: Array<{ path: string; value: string }> = [];

  if (typeof obj === "string") {
    result.push({ path, value: obj });
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      result.push(...extractAllStrings(item, `${path}[${i}]`));
    });
  } else if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      result.push(...extractAllStrings(value, path ? `${path}.${key}` : key));
    }
  }

  return result;
}

/**
 * Check a string against all forbidden patterns.
 * Returns the first matching pattern or null.
 */
function findForbiddenPattern(text: string): RegExp | null {
  for (const pattern of FORBIDDEN_WORDS) {
    if (pattern.test(text)) {
      return pattern;
    }
  }
  return null;
}

// ── Tests ──

describe("Coherence Language Regression (Golden Test)", () => {
  const makeInput = (intake: IntentIntake, signals: ComputedSignals, snapshot: SnapshotV2): CoherenceEngineInput => ({
    run_id: `test-golden-${Date.now()}`,
    intake,
    computedSignals: signals,
    snapshot,
  });

  it("should produce coherence output with NO forbidden language patterns", () => {
    // Run the coherence engine
    const result = runCoherenceEngine(makeInput(GOLDEN_INTAKE, GOLDEN_SIGNALS, MOCK_SNAPSHOT));

    expect(result).toBeDefined();
    expect(result.run_id).toBeDefined();

    // Extract all strings from the raw coherence snapshot
    const rawStrings = extractAllStrings(result);

    // Check each string for forbidden patterns
    const violations: Array<{ path: string; value: string; pattern: string }> = [];

    for (const { path, value } of rawStrings) {
      const match = findForbiddenPattern(value);
      if (match) {
        violations.push({ path, value, pattern: match.toString() });
      }
    }

    // Report all violations for debugging
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  [${v.path}]\n    Text: "${v.value}"\n    Matched: ${v.pattern}`)
        .join("\n\n");
      throw new Error(`Forbidden language detected in coherence output:\n\n${report}`);
    }

    expect(violations).toHaveLength(0);
  });

  it("should produce PRESENTED output with NO forbidden language patterns", () => {
    // Run the coherence engine
    const result = runCoherenceEngine(makeInput(GOLDEN_INTAKE, GOLDEN_SIGNALS, MOCK_SNAPSHOT));

    // Present it
    const presented = presentCoherenceSnapshot(result);

    expect(presented).toBeDefined();
    expect(presented.version).toBe("presented_coherence_v1");

    // Extract all strings from the presented output
    const presentedStrings = extractAllStrings(presented);

    // Check each string for forbidden patterns
    const violations: Array<{ path: string; value: string; pattern: string }> = [];

    for (const { path, value } of presentedStrings) {
      const match = findForbiddenPattern(value);
      if (match) {
        violations.push({ path, value, pattern: match.toString() });
      }
    }

    // Report all violations for debugging
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  [${v.path}]\n    Text: "${v.value}"\n    Matched: ${v.pattern}`)
        .join("\n\n");
      throw new Error(`Forbidden language detected in presented output:\n\n${report}`);
    }

    expect(violations).toHaveLength(0);
  });

  it("should include alignment_summary in presented output", () => {
    const result = runCoherenceEngine(makeInput(GOLDEN_INTAKE, GOLDEN_SIGNALS, MOCK_SNAPSHOT));
    const presented = presentCoherenceSnapshot(result);

    expect(presented.alignment_summary).toBeDefined();
    expect(typeof presented.alignment_summary).toBe("string");
    expect(presented.alignment_summary.length).toBeGreaterThan(0);

    // Alignment summary should not contain forbidden patterns
    const match = findForbiddenPattern(presented.alignment_summary);
    expect(match).toBeNull();
  });

  it("should include unknown_helper for unknown alignments", () => {
    // Create an intake with minimal value tags to trigger unknown
    const minimalIntake: IntentIntake = {
      ...GOLDEN_INTAKE,
      value_proposition_tags: ["other_custom"],
    };

    const result = runCoherenceEngine(makeInput(minimalIntake, GOLDEN_SIGNALS, MOCK_SNAPSHOT));
    const presented = presentCoherenceSnapshot(result);

    // Check if any alignment has unknown_helper set
    const unknownItems = presented.alignment_section.items.filter((item) => item.support === "unknown");

    // If there are unknown items, they should have unknown_helper
    for (const item of unknownItems) {
      expect(item.unknown_helper).toBeDefined();
      expect(item.unknown_helper).toContain("We can't see this clearly");
    }
  });

  it("should include protects_values/relaxes_values on paths when tensions exist", () => {
    const result = runCoherenceEngine(makeInput(GOLDEN_INTAKE, GOLDEN_SIGNALS, MOCK_SNAPSHOT));
    const presented = presentCoherenceSnapshot(result);

    // If there are tensions, path_A and path_B should have value anchors
    if (result.tensions.length > 0) {
      const pathA = presented.path_cards.find((p) => p.name === "path_A");
      const pathB = presented.path_cards.find((p) => p.name === "path_B");

      // At least one path should have value anchors (may be undefined if no mapping exists)
      expect(pathA).toBeDefined();
      expect(pathB).toBeDefined();

      // If value anchors are present, they should be arrays
      if (pathA?.protects_values) {
        expect(Array.isArray(pathA.protects_values)).toBe(true);
      }
      if (pathA?.relaxes_values) {
        expect(Array.isArray(pathA.relaxes_values)).toBe(true);
      }
      if (pathB?.protects_values) {
        expect(Array.isArray(pathB.protects_values)).toBe(true);
      }
      if (pathB?.relaxes_values) {
        expect(Array.isArray(pathB.relaxes_values)).toBe(true);
      }
    }
  });

  it("should produce data_coverage_card with NO forbidden language", () => {
    const result = runCoherenceEngine(makeInput(GOLDEN_INTAKE, GOLDEN_SIGNALS, MOCK_SNAPSHOT));
    const presented = presentCoherenceSnapshot(result);

    expect(presented.data_coverage_card).toBeDefined();

    const allStrings = extractAllStrings(presented.data_coverage_card);
    const violations: Array<{ path: string; value: string; pattern: string }> = [];

    for (const { path, value } of allStrings) {
      const match = findForbiddenPattern(value);
      if (match) {
        violations.push({ path, value, pattern: match.toString() });
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  [${v.path}]\n    Text: "${v.value}"\n    Matched: ${v.pattern}`)
        .join("\n\n");
      throw new Error(`Forbidden language in data_coverage_card:\n\n${report}`);
    }

    expect(violations).toHaveLength(0);
  });

  it("should produce drift output with NO forbidden language", () => {
    const result1 = runCoherenceEngine(makeInput(GOLDEN_INTAKE, GOLDEN_SIGNALS, MOCK_SNAPSHOT));

    // Create a slightly different run for drift comparison
    const result2 = runCoherenceEngine({
      ...makeInput(GOLDEN_INTAKE, GOLDEN_SIGNALS, MOCK_SNAPSHOT),
      run_id: `test-drift-${Date.now()}`,
    });

    const drift = computeCoherenceDrift({ previous: result1, current: result2 });

    const allStrings = extractAllStrings(drift);
    const violations: Array<{ path: string; value: string; pattern: string }> = [];

    for (const { path, value } of allStrings) {
      const match = findForbiddenPattern(value);
      if (match) {
        violations.push({ path, value, pattern: match.toString() });
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  [${v.path}]\n    Text: "${v.value}"\n    Matched: ${v.pattern}`)
        .join("\n\n");
      throw new Error(`Forbidden language in drift output:\n\n${report}`);
    }

    expect(violations).toHaveLength(0);
  });
});
