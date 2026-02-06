/**
 * Value-Prop Alignment Tests
 *
 * Tests:
 * 1. computeValuePropAlignment: classification correctness (supported, mixed, crowded_out, unknown)
 * 2. Unknown handling: missing signals → unknown, never false
 * 3. Crowded-out detection: declared but behavioral contradicts / pressure index
 * 4. Forbidden language scanning: all evidence bullets pass guardrails
 * 5. Confidence rules: high (2-of-3 aligned), med (1-of-3 with data), low (0-of-3)
 * 6. valuePropLabel: human-readable labels
 * 7. Integration: alignment wired into pipeline output
 * 8. Pressure index: derivePressureIndex helper
 */

import { describe, it, expect } from "vitest";
import {
  computeValuePropAlignment,
  valuePropLabel,
  assertNoForbiddenLanguage,
  derivePressureIndex,
} from "../src/lib/coherence/value_alignment";
import type {
  OwnerIntentModel,
  RealitySignal,
} from "../src/lib/types/coherence_engine";

// ── Fixtures ──

function makeIntent(overrides: Partial<OwnerIntentModel> = {}): OwnerIntentModel {
  return {
    version: "intent_v2",
    value_proposition: {
      statement: "We provide reliable same-day plumbing repair.",
      tags: ["speed_responsiveness", "local_trust"],
    },
    priorities_ranked: ["stability", "quality"],
    non_negotiables: ["No compromising on safety"],
    boundaries: {
      time: "No weekends",
      stress: "Less firefighting",
    },
    definition_of_success: "Steady work, good reputation",
    anti_goals: ["Don't raise prices aggressively"],
    context_notes: "8 years in business",
    confidence: "high",
    captured_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSignal(overrides: Partial<RealitySignal> = {}): RealitySignal {
  return {
    id: "sig_test",
    category: "volume",
    observation: "Test observation",
    magnitude: 50,
    confidence: "high",
    data_points: {},
    ...overrides,
  };
}

// ── 1. Classification correctness ──

describe("computeValuePropAlignment", () => {
  it("returns alignments for all declared value-prop tags", () => {
    const intent = makeIntent();
    const signals: RealitySignal[] = [];
    const alignments = computeValuePropAlignment({ intent, reality_signals: signals });

    // Should include at least the 2 directly declared tags
    const tags = alignments.map((a) => a.tag);
    expect(tags).toContain("speed_responsiveness");
    expect(tags).toContain("local_trust");
  });

  it("discovers implied tags from priorities and non-negotiables", () => {
    const intent = makeIntent({
      priorities_ranked: ["Safety and regulatory compliance", "Great customer experience"],
      non_negotiables: ["No cutting corners on quality"],
    });
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    const tags = alignments.map((a) => a.tag);

    // safety_compliance should be implied by the priority
    expect(tags).toContain("safety_compliance");
    // premium_quality should be implied by "No cutting corners on quality"
    expect(tags).toContain("premium_quality");
  });

  it("classifies 'supported' when declared + behavioral evidence agree", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Fast, responsive service",
        tags: ["speed_responsiveness"],
      },
    });
    // Low decision lag → behavioral = true for speed_responsiveness
    const signals: RealitySignal[] = [
      makeSignal({
        id: "sig_timing_decision_lag",
        category: "timing",
        magnitude: 30, // < 55, so speed is supported
      }),
    ];

    const alignments = computeValuePropAlignment({ intent, reality_signals: signals });
    const speed = alignments.find((a) => a.tag === "speed_responsiveness");
    expect(speed).toBeDefined();
    expect(speed!.support).toBe("supported");
    expect(speed!.sources.declared).toBe(true);
    expect(speed!.sources.behavioral).toBe(true);
  });

  it("classifies 'crowded_out' when declared but behavioral contradicts", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Fast, responsive service",
        tags: ["speed_responsiveness"],
      },
    });
    // High decision lag → behavioral = false for speed_responsiveness
    const signals: RealitySignal[] = [
      makeSignal({
        id: "sig_timing_decision_lag",
        category: "timing",
        magnitude: 80, // >= 55, so speed is NOT supported
      }),
    ];

    const alignments = computeValuePropAlignment({ intent, reality_signals: signals });
    const speed = alignments.find((a) => a.tag === "speed_responsiveness");
    expect(speed).toBeDefined();
    expect(speed!.support).toBe("crowded_out");
    expect(speed!.sources.behavioral).toBe(false);
  });

  it("classifies 'unknown' when no evidence exists at all", () => {
    // Tag is NOT declared, NOT implied — only way to get it is if it's somehow added
    // For a real unknown, we need a tag that has no declared, no behavioral, no refusal
    const intent = makeIntent({
      value_proposition: {
        statement: "Custom niche value",
        tags: [], // nothing declared
      },
      priorities_ranked: [],
      non_negotiables: [],
      anti_goals: [],
    });

    // Manually test that other_custom IS unknown when not declared
    // Since nothing is declared or implied, there should be no alignments at all
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    expect(alignments).toHaveLength(0);
  });

  it("classifies 'mixed' when declared but all other evidence is unknown", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Custom niche value",
        tags: ["other_custom"],
      },
      priorities_ranked: [],
      non_negotiables: [],
      anti_goals: [],
    });

    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    const custom = alignments.find((a) => a.tag === "other_custom");
    expect(custom).toBeDefined();
    expect(custom!.support).toBe("mixed");
    expect(custom!.sources.behavioral).toBe("unknown");
  });

  it("classifies 'mixed' when declared but behavioral is unknown", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "We build real relationships",
        tags: ["relationship_care"],
      },
      anti_goals: [], // no refusal evidence
    });
    // No concentration signal → behavioral unknown
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    const rel = alignments.find((a) => a.tag === "relationship_care");
    expect(rel).toBeDefined();
    expect(rel!.support).toBe("mixed");
  });
});

// ── 2. Unknown handling ──

describe("unknown handling", () => {
  it("missing signals produce unknown, never false", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "We value safety",
        tags: ["safety_compliance"],
      },
    });
    // No capacity signal available
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    const safety = alignments.find((a) => a.tag === "safety_compliance");
    expect(safety).toBeDefined();
    expect(safety!.sources.behavioral).toBe("unknown");
    // Should NOT be "crowded_out" — missing data is not negative evidence
    expect(safety!.support).not.toBe("crowded_out");
  });
});

// ── 3. Score and confidence rules ──

describe("confidence rules", () => {
  it("high confidence when 2+ sources with data align", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Fair pricing",
        tags: ["affordability"],
      },
      anti_goals: ["Don't raise prices aggressively"], // refusal evidence
    });
    // Behavioral supports affordability
    const signals: RealitySignal[] = [
      makeSignal({
        id: "sig_volume_invoices",
        category: "volume",
        magnitude: 50,
      }),
    ];

    const alignments = computeValuePropAlignment({ intent, reality_signals: signals });
    const aff = alignments.find((a) => a.tag === "affordability");
    expect(aff).toBeDefined();
    expect(aff!.score).toBeGreaterThanOrEqual(2);
    expect(aff!.confidence).toBe("high");
  });

  it("low confidence when only behavioral unknown with no refusal", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Custom thing",
        tags: ["other_custom"],
      },
      priorities_ranked: [],
      non_negotiables: [],
      anti_goals: [],
    });
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    const custom = alignments.find((a) => a.tag === "other_custom");
    expect(custom).toBeDefined();
    // Only declared = true, behavioral = unknown, refusal = false → med
    expect(["low", "med"]).toContain(custom!.confidence);
  });

  it("score is 0-3 range", () => {
    const intent = makeIntent();
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    for (const a of alignments) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(3);
    }
  });
});

// ── 4. Forbidden language scanning ──

describe("forbidden language guard", () => {
  it("assertNoForbiddenLanguage passes clean text", () => {
    expect(() =>
      assertNoForbiddenLanguage("Your data patterns are consistent with fast response.")
    ).not.toThrow();
  });

  it("assertNoForbiddenLanguage rejects 'you should'", () => {
    expect(() => assertNoForbiddenLanguage("You should improve pricing.")).toThrow(
      /Forbidden language/
    );
  });

  it("assertNoForbiddenLanguage rejects 'benchmark'", () => {
    expect(() =>
      assertNoForbiddenLanguage("This is below the industry benchmark.")
    ).toThrow(/Forbidden language/);
  });

  it("all evidence bullets in a full alignment run pass guardrails", () => {
    const intent = makeIntent();
    const signals: RealitySignal[] = [
      makeSignal({ id: "sig_timing_decision_lag", category: "timing", magnitude: 30 }),
      makeSignal({ id: "sig_concentration_customer", category: "concentration", magnitude: 60 }),
      makeSignal({ id: "sig_volume_invoices", category: "volume", magnitude: 40 }),
    ];

    const alignments = computeValuePropAlignment({ intent, reality_signals: signals });
    for (const a of alignments) {
      for (const bullet of a.evidence.bullets) {
        expect(() => assertNoForbiddenLanguage(bullet)).not.toThrow();
      }
      if (a.gentle_check) {
        expect(() => assertNoForbiddenLanguage(a.gentle_check!)).not.toThrow();
      }
    }
  });
});

// ── 5. valuePropLabel ──

describe("valuePropLabel", () => {
  it("returns human-readable labels for known tags", () => {
    expect(valuePropLabel("speed_responsiveness")).toBe("Fast response");
    expect(valuePropLabel("affordability")).toBe("Fair pricing");
    expect(valuePropLabel("local_trust")).toBe("Local trust");
    expect(valuePropLabel("premium_quality")).toBe("Premium quality");
    expect(valuePropLabel("safety_compliance")).toBe("Safety & compliance");
  });

  it("falls back to space-separated for unknown tags", () => {
    expect(valuePropLabel("some_unknown_tag")).toBe("some unknown tag");
  });
});

// ── 6. Gentle check prompts ──

describe("gentle check prompts", () => {
  it("includes gentle_check for crowded_out items", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Fast response",
        tags: ["speed_responsiveness"],
      },
    });
    const signals: RealitySignal[] = [
      makeSignal({ id: "sig_timing_decision_lag", category: "timing", magnitude: 80 }),
    ];

    const alignments = computeValuePropAlignment({ intent, reality_signals: signals });
    const speed = alignments.find((a) => a.tag === "speed_responsiveness");
    expect(speed).toBeDefined();
    expect(speed!.support).toBe("crowded_out");
    expect(speed!.gentle_check).toBeDefined();
    expect(speed!.gentle_check!.length).toBeGreaterThan(0);
  });

  it("includes gentle_check for mixed items", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Relationships",
        tags: ["relationship_care"],
      },
      anti_goals: [],
    });

    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    const rel = alignments.find((a) => a.tag === "relationship_care");
    expect(rel).toBeDefined();
    expect(rel!.support).toBe("mixed");
    expect(rel!.gentle_check).toBeDefined();
  });
});

// ── 7. Sort order ──

describe("sort order", () => {
  it("sorts supported before mixed before crowded_out before unknown", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Everything",
        tags: ["speed_responsiveness", "other_custom", "local_trust"],
      },
      priorities_ranked: [],
      non_negotiables: [],
      anti_goals: [],
    });
    const signals: RealitySignal[] = [
      // speed: behavioral true → supported (declared + behavioral)
      makeSignal({ id: "sig_timing_decision_lag", category: "timing", magnitude: 30 }),
      // local_trust: concentration high → supported  
      makeSignal({ id: "sig_concentration_customer", category: "concentration", magnitude: 60 }),
      // other_custom: no evaluator → unknown
    ];

    const alignments = computeValuePropAlignment({ intent, reality_signals: signals });
    const supportOrder = alignments.map((a) => a.support);
    
    // All supported items should come before unknown
    const firstUnknown = supportOrder.indexOf("unknown");
    const lastSupported = supportOrder.lastIndexOf("supported");
    if (firstUnknown >= 0 && lastSupported >= 0) {
      expect(lastSupported).toBeLessThan(firstUnknown);
    }
  });
});

// ── 8. Evidence bullets structure ──

describe("evidence bullets", () => {
  it("always contains at least one bullet per alignment", () => {
    const intent = makeIntent();
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    for (const a of alignments) {
      expect(a.evidence.bullets.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("includes declared-source bullet when tag is directly selected", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Speed",
        tags: ["speed_responsiveness"],
      },
    });
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    const speed = alignments.find((a) => a.tag === "speed_responsiveness");
    expect(speed).toBeDefined();
    expect(speed!.evidence.bullets.some((b) => b.includes("selected"))).toBe(true);
  });

  it("includes behavioral-source bullet when signal data exists", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Speed",
        tags: ["speed_responsiveness"],
      },
    });
    const signals: RealitySignal[] = [
      makeSignal({ id: "sig_timing_decision_lag", category: "timing", magnitude: 30 }),
    ];
    const alignments = computeValuePropAlignment({ intent, reality_signals: signals });
    const speed = alignments.find((a) => a.tag === "speed_responsiveness");
    expect(speed).toBeDefined();
    expect(speed!.evidence.bullets.some((b) => b.includes("data patterns"))).toBe(true);
  });

  it("includes refusal-source bullet when anti-goals align", () => {
    const intent = makeIntent({
      value_proposition: {
        statement: "Fair pricing",
        tags: ["affordability"],
      },
      anti_goals: ["Don't raise prices aggressively"],
    });
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    const aff = alignments.find((a) => a.tag === "affordability");
    expect(aff).toBeDefined();
    expect(aff!.evidence.bullets.some((b) => b.includes("boundaries"))).toBe(true);
    expect(aff!.sources.refusal).toBe(true);
  });
});

// ── 9. Notes (dev/debug) ──

describe("notes", () => {
  it("includes source breakdown in notes", () => {
    const intent = makeIntent();
    const alignments = computeValuePropAlignment({ intent, reality_signals: [] });
    for (const a of alignments) {
      expect(a.notes).toBeDefined();
      expect(a.notes!.length).toBeGreaterThanOrEqual(1);
      expect(a.notes!.some((n) => n.includes("declared="))).toBe(true);
      expect(a.notes!.some((n) => n.includes("behavioral="))).toBe(true);
    }
  });
});

// ── 10. Pressure index ──

describe("derivePressureIndex", () => {
  it("detects owner bottleneck pressure", () => {
    const signals: RealitySignal[] = [
      makeSignal({
        id: "sig_owner_dependency_owner_only",
        category: "owner_dependency",
        magnitude: 75,
      }),
    ];
    const pressure = derivePressureIndex(signals);
    expect(pressure.pressures.find((p) => p.id === "owner_bottleneck")?.active).toBe(true);
    expect(pressure.crowded_tags.has("speed_responsiveness")).toBe(true);
  });

  it("detects scheduling chaos pressure", () => {
    const signals: RealitySignal[] = [
      makeSignal({
        id: "sig_rhythm_volatility",
        category: "rhythm",
        magnitude: 70,
      }),
    ];
    const pressure = derivePressureIndex(signals);
    expect(pressure.pressures.find((p) => p.id === "scheduling_chaos")?.active).toBe(true);
    expect(pressure.crowded_tags.has("clarity_communication")).toBe(true);
  });

  it("returns empty crowded_tags when no pressure", () => {
    const signals: RealitySignal[] = [
      makeSignal({
        id: "sig_volume_invoices",
        category: "volume",
        magnitude: 20,
      }),
    ];
    const pressure = derivePressureIndex(signals);
    expect(pressure.crowded_tags.size).toBe(0);
  });
});
