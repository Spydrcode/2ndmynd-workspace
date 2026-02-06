/**
 * Data Coverage + Value Visibility Impact Tests
 *
 * Tests computeDataCoverage and computeValueVisibilityImpact.
 * DOCTRINE: All output text is scanned for forbidden patterns.
 */

import { describe, it, expect } from "vitest";
import { computeDataCoverage, computeValueVisibilityImpact } from "../src/lib/coherence/data_coverage";
import { runCoherenceEngine, type CoherenceEngineInput } from "../src/lib/coherence/index";
import { presentCoherenceSnapshot } from "../src/lib/present/present_coherence";
import { FORBIDDEN_WORDS } from "../src/lib/coherence/language_guardrails";
import type { IntentIntake } from "../src/lib/coherence/build_owner_intent";
import type { ComputedSignals } from "../mcp/tools/compute_signals_v2";
import type { SnapshotV2 } from "../lib/decision/v2/conclusion_schema_v2";
import type { RealitySignals, ValuePropAlignment } from "../src/lib/types/coherence_engine";

// ── Helper ──

function findForbiddenPattern(text: string): RegExp | null {
  for (const pattern of FORBIDDEN_WORDS) {
    if (pattern.test(text)) return pattern;
  }
  return null;
}

function extractAllStrings(obj: unknown, path = ""): Array<{ path: string; value: string }> {
  const result: Array<{ path: string; value: string }> = [];
  if (typeof obj === "string") {
    result.push({ path, value: obj });
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => result.push(...extractAllStrings(item, `${path}[${i}]`)));
  } else if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      result.push(...extractAllStrings(value, path ? `${path}.${key}` : key));
    }
  }
  return result;
}

// ── Fixtures ──

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

const MOCK_SIGNALS: RealitySignals = {
  version: "signals_v1",
  signals: [
    {
      id: "sig_volume_quotes",
      category: "volume",
      observation: "120 quotes",
      magnitude: 60,
      confidence: "high",
      data_points: { quotes_count: 120 },
    },
    {
      id: "sig_volume_invoices",
      category: "volume",
      observation: "80 invoices",
      magnitude: 40,
      confidence: "high",
      data_points: { invoices_count: 80 },
    },
  ],
  window: { start_date: "2024-01-01", end_date: "2024-03-31", records_used: 200 },
  missing_data: [],
};

const MOCK_ALIGNMENTS: ValuePropAlignment[] = [
  {
    tag: "speed_responsiveness",
    label: "Fast response",
    confidence: "med",
    sources: { declared: true, behavioral: "unknown", refusal: false },
    score: 1,
    support: "mixed",
    evidence: { signal_ids: ["sig_volume_quotes"], bullets: ["Some quotes present"] },
  },
  {
    tag: "local_trust",
    label: "Local trust",
    confidence: "high",
    sources: { declared: true, behavioral: true, refusal: false },
    score: 3,
    support: "supported",
    evidence: { signal_ids: ["sig_volume_invoices"], bullets: ["Invoices show repeat patterns"] },
  },
  {
    tag: "availability_when_others_wont",
    label: "Available when others aren't",
    confidence: "low",
    sources: { declared: true, behavioral: "unknown", refusal: false },
    score: 0,
    support: "unknown",
    evidence: { signal_ids: [], bullets: [] },
  },
];

// ── Tests ──

describe("computeDataCoverage", () => {
  it("should detect present/absent sources correctly", () => {
    const coverage = computeDataCoverage({ snapshot: MOCK_SNAPSHOT, signals: MOCK_SIGNALS });

    expect(coverage.sources).toHaveLength(5);

    const quotes = coverage.sources.find((s) => s.name === "quotes");
    expect(quotes?.status).toBe("present");
    expect(quotes?.record_count).toBe(120);

    const invoices = coverage.sources.find((s) => s.name === "invoices");
    expect(invoices?.status).toBe("present");

    const calendar = coverage.sources.find((s) => s.name === "calendar");
    expect(calendar?.status).toBe("absent");

    const expenses = coverage.sources.find((s) => s.name === "expenses");
    expect(expenses?.status).toBe("absent");
  });

  it("should produce calm, structural notes without forbidden patterns", () => {
    const coverage = computeDataCoverage({ snapshot: MOCK_SNAPSHOT, signals: MOCK_SIGNALS });

    const allStrings = extractAllStrings(coverage);
    for (const { path, value } of allStrings) {
      const match = findForbiddenPattern(value);
      expect(match, `Forbidden pattern at ${path}: "${value}"`).toBeNull();
    }
  });

  it("should mark partial coverage for low record counts", () => {
    const sparseSnapshot: SnapshotV2 = {
      ...MOCK_SNAPSHOT,
      activity_signals: {
        ...MOCK_SNAPSHOT.activity_signals,
        quotes: { ...MOCK_SNAPSHOT.activity_signals.quotes, quotes_count: 3 },
      },
    };

    const coverage = computeDataCoverage({ snapshot: sparseSnapshot, signals: MOCK_SIGNALS });
    const quotes = coverage.sources.find((s) => s.name === "quotes");
    expect(quotes?.status).toBe("partial");
  });
});

describe("computeValueVisibilityImpact", () => {
  it("should assess visibility for each alignment item", () => {
    const coverage = computeDataCoverage({ snapshot: MOCK_SNAPSHOT, signals: MOCK_SIGNALS });
    const impacts = computeValueVisibilityImpact(MOCK_ALIGNMENTS, coverage);

    expect(impacts).toHaveLength(3);

    // local_trust should have good visibility (quotes + invoices present)
    const localTrust = impacts.find((i) => i.tag === "local_trust");
    expect(localTrust?.visibility).toBe("clear");

    // availability should have limited visibility (calendar absent)
    const availability = impacts.find((i) => i.tag === "availability_when_others_wont");
    expect(availability?.visibility).toBe("limited");
  });

  it("should produce no forbidden language in reasons", () => {
    const coverage = computeDataCoverage({ snapshot: MOCK_SNAPSHOT, signals: MOCK_SIGNALS });
    const impacts = computeValueVisibilityImpact(MOCK_ALIGNMENTS, coverage);

    for (const impact of impacts) {
      const match = findForbiddenPattern(impact.reason);
      expect(match, `Forbidden pattern in reason for ${impact.tag}: "${impact.reason}"`).toBeNull();
    }
  });
});

describe("Data coverage in full pipeline", () => {
  it("should include data_coverage and value_visibility in CoherenceSnapshot", () => {
    const intake: IntentIntake = {
      value_proposition_statement: "Reliable same-day plumbing repair.",
      value_proposition_tags: ["speed_responsiveness", "local_trust"],
      priorities_ranked: ["stability", "quality"],
      non_negotiables: ["Licensed and insured"],
      boundaries: { time: "6am-4pm" },
      definition_of_success: "Steady work, good reputation",
      anti_goals: ["No franchising"],
    };

    const signals: ComputedSignals = {
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

    const input: CoherenceEngineInput = {
      run_id: "test-coverage-1",
      intake,
      computedSignals: signals,
      snapshot: MOCK_SNAPSHOT,
    };

    const result = runCoherenceEngine(input);

    expect(result.data_coverage).toBeDefined();
    expect(result.data_coverage!.sources.length).toBeGreaterThan(0);
    expect(result.value_visibility).toBeDefined();
    expect(result.value_visibility!.length).toBeGreaterThan(0);
  });

  it("should include data_coverage_card in presented output", () => {
    const intake: IntentIntake = {
      value_proposition_statement: "Reliable repair.",
      value_proposition_tags: ["speed_responsiveness"],
      priorities_ranked: ["stability"],
      non_negotiables: ["Licensed"],
      boundaries: {},
      definition_of_success: "Steady work",
      anti_goals: [],
    };

    const signals: ComputedSignals = {
      seasonality_pattern: "moderate",
      seasonality_evidence: "Fall rises",
      volatility_band: "high",
      volatility_evidence: "Wide",
      approval_lag_signal: "High",
      payment_lag_signal: "Elevated",
      concentration_signals: [],
      capacity_signals: [],
      owner_dependency: [],
      business_type_hypothesis: "Contractor",
      confidence: "high",
      missing_data_flags: [],
    };

    const result = runCoherenceEngine({
      run_id: "test-present-coverage",
      intake,
      computedSignals: signals,
      snapshot: MOCK_SNAPSHOT,
    });

    const presented = presentCoherenceSnapshot(result);
    expect(presented.data_coverage_card).toBeDefined();
    expect(presented.data_coverage_card!.title).toBe("What data we're working with");
    expect(presented.data_coverage_card!.sources.length).toBeGreaterThan(0);
  });
});
