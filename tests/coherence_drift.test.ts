/**
 * Coherence Drift Tests
 *
 * Tests computeCoherenceDrift comparing two snapshots.
 * DOCTRINE: All output text is scanned for forbidden patterns.
 */

import { describe, it, expect } from "vitest";
import { computeCoherenceDrift } from "../src/lib/coherence/coherence_drift";
import { FORBIDDEN_WORDS } from "../src/lib/coherence/language_guardrails";
import type { CoherenceSnapshot } from "../src/lib/types/coherence_engine";

// ── Helpers ──

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

// ── Minimal Snapshot Factory ──

function makeSnapshot(overrides: Partial<CoherenceSnapshot> & { run_id: string }): CoherenceSnapshot {
  return {
    version: "coherence_v1",
    run_id: overrides.run_id,
    created_at: overrides.created_at ?? new Date().toISOString(),
    intent: overrides.intent ?? {
      version: "intent_v2",
      value_proposition: { statement: "Fast plumbing repair", tags: ["speed_responsiveness"] },
      priorities_ranked: ["stability"],
      non_negotiables: ["Licensed"],
      boundaries: {},
      definition_of_success: "Steady work",
      anti_goals: [],
      confidence: "high",
      captured_at: new Date().toISOString(),
    },
    signals: overrides.signals ?? {
      version: "signals_v1",
      signals: [],
      window: { start_date: "2024-01-01", end_date: "2024-03-31", records_used: 100 },
      missing_data: [],
    },
    value_prop_alignment: overrides.value_prop_alignment ?? [],
    tensions: overrides.tensions ?? [],
    paths: overrides.paths ?? [],
    end_state: overrides.end_state ?? {
      state: "awaiting_commitment",
      timestamp: new Date().toISOString(),
    },
    confidence: overrides.confidence ?? { level: "high", reason: "Test" },
  };
}

// ── Tests ──

describe("computeCoherenceDrift", () => {
  it("should detect alignment improvements", () => {
    const previous = makeSnapshot({
      run_id: "prev-1",
      created_at: "2024-01-01T00:00:00Z",
      value_prop_alignment: [
        {
          tag: "speed_responsiveness",
          label: "Fast response",
          confidence: "med",
          sources: { declared: true, behavioral: "unknown", refusal: false },
          score: 1,
          support: "mixed",
          evidence: { signal_ids: [], bullets: [] },
        },
      ],
    });

    const current = makeSnapshot({
      run_id: "cur-1",
      created_at: "2024-02-01T00:00:00Z",
      value_prop_alignment: [
        {
          tag: "speed_responsiveness",
          label: "Fast response",
          confidence: "high",
          sources: { declared: true, behavioral: true, refusal: false },
          score: 3,
          support: "supported",
          evidence: { signal_ids: ["sig_1"], bullets: ["Evidence"] },
        },
      ],
    });

    const drift = computeCoherenceDrift({ previous, current });

    expect(drift.version).toBe("drift_v1");
    expect(drift.days_between).toBe(31);
    expect(drift.alignment_deltas).toHaveLength(1);
    expect(drift.alignment_deltas[0].direction).toBe("improved");
  });

  it("should detect alignment declines", () => {
    const previous = makeSnapshot({
      run_id: "prev-2",
      created_at: "2024-01-01T00:00:00Z",
      value_prop_alignment: [
        {
          tag: "local_trust",
          label: "Local trust",
          confidence: "high",
          sources: { declared: true, behavioral: true, refusal: false },
          score: 3,
          support: "supported",
          evidence: { signal_ids: ["sig_1"], bullets: ["Good"] },
        },
      ],
    });

    const current = makeSnapshot({
      run_id: "cur-2",
      created_at: "2024-02-01T00:00:00Z",
      value_prop_alignment: [
        {
          tag: "local_trust",
          label: "Local trust",
          confidence: "med",
          sources: { declared: true, behavioral: "unknown", refusal: false },
          score: 1,
          support: "crowded_out",
          evidence: { signal_ids: [], bullets: [] },
        },
      ],
    });

    const drift = computeCoherenceDrift({ previous, current });
    expect(drift.alignment_deltas[0].direction).toBe("declined");
  });

  it("should detect eased and worsened tensions", () => {
    const previous = makeSnapshot({
      run_id: "prev-3",
      created_at: "2024-01-01T00:00:00Z",
      tensions: [
        {
          id: "t1",
          intent_anchor: "You value stability",
          claim: "Tension claim",
          evidence: { signal_ids: ["sig_1"], data_points: {} },
          mechanism: "Structural",
          owner_cost: "Stress",
          severity: 70,
          confidence: "high",
          what_must_be_true: [],
        },
        {
          id: "t2",
          intent_anchor: "You value quality",
          claim: "Quality tension",
          evidence: { signal_ids: ["sig_2"], data_points: {} },
          mechanism: "Overload",
          owner_cost: "Time",
          severity: 30,
          confidence: "med",
          what_must_be_true: [],
        },
      ],
    });

    const current = makeSnapshot({
      run_id: "cur-3",
      created_at: "2024-02-01T00:00:00Z",
      tensions: [
        {
          id: "t1",
          intent_anchor: "You value stability",
          claim: "Tension claim",
          evidence: { signal_ids: ["sig_1"], data_points: {} },
          mechanism: "Structural",
          owner_cost: "Stress",
          severity: 40,
          confidence: "high",
          what_must_be_true: [],
        },
        {
          id: "t2",
          intent_anchor: "You value quality",
          claim: "Quality tension",
          evidence: { signal_ids: ["sig_2"], data_points: {} },
          mechanism: "Overload",
          owner_cost: "Time",
          severity: 55,
          confidence: "med",
          what_must_be_true: [],
        },
      ],
    });

    const drift = computeCoherenceDrift({ previous, current });

    expect(drift.tension_shifts).toHaveLength(2);

    const t1Shift = drift.tension_shifts.find((s) => s.tension_id === "t1");
    expect(t1Shift?.direction).toBe("eased");

    const t2Shift = drift.tension_shifts.find((s) => s.tension_id === "t2");
    expect(t2Shift?.direction).toBe("worsened");
  });

  it("should detect new and resolved tensions", () => {
    const previous = makeSnapshot({
      run_id: "prev-4",
      created_at: "2024-01-01T00:00:00Z",
      tensions: [
        {
          id: "t_old",
          intent_anchor: "Old tension",
          claim: "Was present",
          evidence: { signal_ids: [], data_points: {} },
          mechanism: "M",
          owner_cost: "C",
          severity: 50,
          confidence: "high",
          what_must_be_true: [],
        },
      ],
    });

    const current = makeSnapshot({
      run_id: "cur-4",
      created_at: "2024-02-01T00:00:00Z",
      tensions: [
        {
          id: "t_new",
          intent_anchor: "New tension",
          claim: "Newly appeared",
          evidence: { signal_ids: [], data_points: {} },
          mechanism: "M",
          owner_cost: "C",
          severity: 60,
          confidence: "med",
          what_must_be_true: [],
        },
      ],
    });

    const drift = computeCoherenceDrift({ previous, current });

    const newShift = drift.tension_shifts.find((s) => s.tension_id === "t_new");
    expect(newShift?.direction).toBe("worsened");
    expect(newShift?.prior_severity).toBe(0);

    const resolvedShift = drift.tension_shifts.find((s) => s.tension_id === "t_old");
    expect(resolvedShift?.direction).toBe("eased");
    expect(resolvedShift?.current_severity).toBe(0);

    expect(drift.structural_notes.length).toBeGreaterThan(0);
  });

  it("should produce stable summary when nothing changed", () => {
    const snapshot = makeSnapshot({
      run_id: "snap",
      created_at: "2024-01-01T00:00:00Z",
      value_prop_alignment: [
        {
          tag: "speed_responsiveness",
          label: "Fast response",
          confidence: "high",
          sources: { declared: true, behavioral: true, refusal: false },
          score: 3,
          support: "supported",
          evidence: { signal_ids: ["sig_1"], bullets: ["Good"] },
        },
      ],
      tensions: [
        {
          id: "t1",
          intent_anchor: "Stability",
          claim: "Claim",
          evidence: { signal_ids: [], data_points: {} },
          mechanism: "M",
          owner_cost: "C",
          severity: 50,
          confidence: "high",
          what_must_be_true: [],
        },
      ],
    });

    const current = makeSnapshot({
      ...snapshot,
      run_id: "snap2",
      created_at: "2024-02-01T00:00:00Z",
    });

    const drift = computeCoherenceDrift({ previous: snapshot, current });
    expect(drift.summary).toContain("stable");
  });

  it("should produce NO forbidden language in drift output", () => {
    const previous = makeSnapshot({
      run_id: "prev-lang",
      created_at: "2024-01-01T00:00:00Z",
      value_prop_alignment: [
        {
          tag: "speed_responsiveness",
          label: "Fast response",
          confidence: "med",
          sources: { declared: true, behavioral: "unknown", refusal: false },
          score: 1,
          support: "mixed",
          evidence: { signal_ids: [], bullets: [] },
        },
      ],
      tensions: [
        {
          id: "t1",
          intent_anchor: "Stability",
          claim: "Tension",
          evidence: { signal_ids: [], data_points: {} },
          mechanism: "M",
          owner_cost: "C",
          severity: 70,
          confidence: "high",
          what_must_be_true: [],
        },
      ],
    });

    const current = makeSnapshot({
      run_id: "cur-lang",
      created_at: "2024-02-01T00:00:00Z",
      value_prop_alignment: [
        {
          tag: "speed_responsiveness",
          label: "Fast response",
          confidence: "high",
          sources: { declared: true, behavioral: true, refusal: false },
          score: 3,
          support: "supported",
          evidence: { signal_ids: ["sig_1"], bullets: ["Evidence"] },
        },
      ],
      tensions: [
        {
          id: "t1",
          intent_anchor: "Stability",
          claim: "Tension",
          evidence: { signal_ids: [], data_points: {} },
          mechanism: "M",
          owner_cost: "C",
          severity: 40,
          confidence: "high",
          what_must_be_true: [],
        },
      ],
    });

    const drift = computeCoherenceDrift({ previous, current });

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
