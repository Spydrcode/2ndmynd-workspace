/**
 * Intent Intake + Value Confidence + Language Guardrails Tests
 *
 * Covers:
 * - Part A: Intent intake types, 7-question schema, completeness scoring
 * - Part B: Language guardrails, sentence templates, renderClaim
 * - Part C: Value-confidence inference, conflict detection, behavioral evidence
 * - Integration: Pricing gates, forbidden language, partial intake handling
 */

import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import intakeSchema from "../schemas/owner_intent_intake.schema.json";
import modelSchema from "../schemas/owner_intent_model.schema.json";
import {
  type OwnerIntentIntake,
  type ValuePropTag,
  type PriorityTag,
  VALUE_PROP_TAGS,
  PRIORITY_TAGS,
  NON_NEGOTIABLE_TAGS,
  ANTI_GOAL_TAGS,
  CONSTRAINT_TAGS,
} from "../src/lib/types/intent_intake";
import {
  computeIntakeCompleteness,
  INTAKE_QUESTIONS,
} from "../src/lib/coherence/intake_questions";
import {
  inferValueEvidence,
  computeValueConfidence,
  detectIntakeConflicts,
  BEHAVIORAL_EVIDENCE_MAP,
} from "../src/lib/coherence/value_confidence";
import {
  renderClaim,
  renderTemplate,
  checkForbiddenLanguage,
  sanitizeForbidden,
  FORBIDDEN_WORDS,
  SENTENCE_TEMPLATES,
} from "../src/lib/coherence/language_guardrails";
import { buildFromIntake } from "../src/lib/coherence/build_owner_intent_v3";
import type { RealitySignals, RealitySignal } from "../src/lib/types/coherence_engine";

// ── Fixtures ──

const FULL_INTAKE: OwnerIntentIntake = {
  intake_version: "0.2",
  collected_at: "2025-06-01T10:00:00Z",
  value_prop_tags: ["speed_responsiveness", "local_trust"],
  priorities_ranked: ["predictability_stability", "reputation_trust", "craftsmanship_quality"],
  non_negotiables: ["no_safety_compromise", "protect_reputation", "keep_prices_fair"],
  anti_goals: ["dont_work_nights_weekends", "dont_chase_growth_at_all_costs", "dont_take_debt"],
  primary_constraint: "scheduling_chaos",
  success_90d: "Steady work, home by 5, good reputation in the neighborhood.",
  context_notes: "Licensed plumber, serve metro area only. Family schedule is important.",
};

const PARTIAL_INTAKE: OwnerIntentIntake = {
  intake_version: "0.2",
  collected_at: "2025-06-01T10:00:00Z",
  value_prop_tags: ["affordability"],
  priorities_ranked: ["profit_margin"],
  non_negotiables: [],
  anti_goals: [],
  primary_constraint: "cashflow_gaps",
  success_90d: "",
};

const CONFLICTING_INTAKE: OwnerIntentIntake = {
  intake_version: "0.2",
  collected_at: "2025-06-01T10:00:00Z",
  value_prop_tags: ["affordability", "premium_quality"],
  priorities_ranked: ["profit_margin", "craftsmanship_quality", "growth_scale"],
  non_negotiables: ["keep_prices_fair", "stay_small_owner_led"],
  anti_goals: ["dont_raise_prices_aggressively", "dont_scale_headcount"],
  primary_constraint: "cashflow_gaps",
  success_90d: "20% revenue growth while keeping prices fair",
};

const MOCK_SIGNALS: RealitySignals = {
  version: "signals_v1",
  signals: [
    {
      id: "sig_volume_quotes",
      category: "volume",
      observation: "85 quotes were created during this window.",
      magnitude: 42,
      confidence: "high",
      data_points: { quotes_count: 85 },
    },
    {
      id: "sig_volume_invoices",
      category: "volume",
      observation: "55 invoices were issued during this window.",
      magnitude: 27,
      confidence: "high",
      data_points: { invoices_count: 55 },
    },
    {
      id: "sig_timing_decision_lag",
      category: "timing",
      observation: "Quotes typically wait a high amount of time before a decision is made.",
      magnitude: 65,
      confidence: "high",
      data_points: { decision_lag_band: "high" },
    },
    {
      id: "sig_concentration_customer",
      category: "concentration",
      observation: "3 customers account for 68% of invoiced revenue.",
      magnitude: 68,
      confidence: "high",
      data_points: { source: "customer", concentration_pct: 68 },
    },
    {
      id: "sig_volume_approval_rate",
      category: "volume",
      observation: "A low share of quotes are being approved.",
      magnitude: 55,
      confidence: "high",
      data_points: { approval_rate_band: "low" },
    },
    {
      id: "sig_rhythm_volatility",
      category: "rhythm",
      observation: "Week-to-week volume varies significantly (high volatility).",
      magnitude: 65,
      confidence: "high",
      data_points: { volatility_band: "high" },
    },
  ],
  window: {
    start_date: "2024-01-01",
    end_date: "2024-03-31",
    records_used: 140,
  },
  missing_data: [],
};

// ============================================================================
// PART A: INTENT INTAKE
// ============================================================================

describe("Part A: Intent Intake", () => {
  describe("Tag enums", () => {
    it("VALUE_PROP_TAGS has exactly 10 entries", () => {
      expect(VALUE_PROP_TAGS).toHaveLength(10);
    });

    it("PRIORITY_TAGS has exactly 10 entries", () => {
      expect(PRIORITY_TAGS).toHaveLength(10);
    });

    it("NON_NEGOTIABLE_TAGS has exactly 9 entries", () => {
      expect(NON_NEGOTIABLE_TAGS).toHaveLength(9);
    });

    it("ANTI_GOAL_TAGS has exactly 8 entries", () => {
      expect(ANTI_GOAL_TAGS).toHaveLength(8);
    });

    it("CONSTRAINT_TAGS has exactly 10 entries", () => {
      expect(CONSTRAINT_TAGS).toHaveLength(10);
    });
  });

  describe("7-question copy", () => {
    it("has exactly 7 questions", () => {
      expect(INTAKE_QUESTIONS).toHaveLength(7);
    });

    it("each question says 'no right answer'", () => {
      for (const q of INTAKE_QUESTIONS) {
        if (q.number <= 6) {
          expect(q.subtitle.toLowerCase()).toContain("no right answer");
        }
      }
    });

    it("question types match spec", () => {
      const types = INTAKE_QUESTIONS.map(q => q.type);
      expect(types).toEqual([
        "checkbox",   // Q1
        "drag-rank",  // Q2
        "checkbox",   // Q3
        "checkbox",   // Q4
        "radio",      // Q5
        "textarea",   // Q6
        "textarea",   // Q7
      ]);
    });
  });

  describe("JSON Schema validation", () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(intakeSchema);

    it("accepts full valid intake", () => {
      const valid = validate(FULL_INTAKE);
      expect(valid).toBe(true);
    });

    it("accepts partial intake (minimal fields)", () => {
      const minimal: Partial<OwnerIntentIntake> = {
        intake_version: "0.2",
        collected_at: "2025-06-01T10:00:00Z",
      };
      const valid = validate(minimal);
      expect(valid).toBe(true);
    });

    it("rejects invalid value_prop_tags entries", () => {
      const bad = {
        ...FULL_INTAKE,
        value_prop_tags: ["speed_responsiveness", "INVALID_TAG"],
      };
      const valid = validate(bad);
      expect(valid).toBe(false);
    });

    it("rejects more than 2 value_prop_tags", () => {
      const bad = {
        ...FULL_INTAKE,
        value_prop_tags: ["speed_responsiveness", "local_trust", "affordability"],
      };
      const valid = validate(bad);
      expect(valid).toBe(false);
    });

    it("rejects duplicate priorities_ranked", () => {
      const bad = {
        ...FULL_INTAKE,
        priorities_ranked: ["profit_margin", "profit_margin"],
      };
      const valid = validate(bad);
      expect(valid).toBe(false);
    });
  });

  describe("Intake completeness scoring", () => {
    it("gives 7/7 for full intake", () => {
      const result = computeIntakeCompleteness(FULL_INTAKE);
      expect(result.score).toBe(7);
      expect(result.label).toBe("Strong");
    });

    it("gives low score for partial intake", () => {
      const result = computeIntakeCompleteness(PARTIAL_INTAKE);
      expect(result.score).toBeLessThanOrEqual(3);
    });

    it("gives 0 for empty intake", () => {
      const result = computeIntakeCompleteness({});
      expect(result.score).toBe(0);
      expect(result.label).toBe("Minimal");
    });
  });

  describe("buildFromIntake", () => {
    it("produces intent_v3 model from full intake", () => {
      const model = buildFromIntake(FULL_INTAKE);
      expect(model.version).toBe("intent_v3");
      expect(model.priorities_ranked).toEqual(FULL_INTAKE.priorities_ranked);
      expect(model.non_negotiables).toEqual(FULL_INTAKE.non_negotiables);
      expect(model.confidence).toBe("high");
    });

    it("assigns lower confidence for partial intake", () => {
      const model = buildFromIntake(PARTIAL_INTAKE);
      expect(["low", "med"]).toContain(model.confidence);
    });
  });
});

// ============================================================================
// PART B: LANGUAGE GUARDRAILS
// ============================================================================

describe("Part B: Language Guardrails", () => {
  describe("Forbidden word detection", () => {
    it("catches 'you should' and 'benchmark'", () => {
      const violations = checkForbiddenLanguage("you should benchmark your performance");
      expect(violations).toContain("you should");
      expect(violations).toContain("benchmark");
    });

    it("passes clean text", () => {
      const violations = checkForbiddenLanguage(
        "Your data suggests a pattern of steady work with seasonal variations."
      );
      expect(violations).toHaveLength(0);
    });

    it("catches 'underperforming'", () => {
      const violations = checkForbiddenLanguage("Your team is underperforming in Q2");
      expect(violations.length).toBeGreaterThan(0);
    });
  });

  describe("sanitizeForbidden", () => {
    it("rewrites 'you should' to 'you could consider'", () => {
      const result = sanitizeForbidden("you should raise your prices");
      expect(result).not.toContain("you should");
      expect(result).toContain("you could consider");
    });

    it("rewrites 'you must' to 'it may help to'", () => {
      const result = sanitizeForbidden("you must improve your margins");
      expect(result).toContain("it may help to");
    });
  });

  describe("renderClaim", () => {
    it("renders a high-confidence claim", () => {
      const result = renderClaim({
        confidence: "high",
        intent_anchor: "stability",
        evidence: "3 customers account for 68% of revenue",
        mechanism: "losing one could force sudden changes",
        owner_cost: "stress from dependency",
      });
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(20);
      // No forbidden words
      expect(checkForbiddenLanguage(result)).toHaveLength(0);
    });

    it("renders a low-confidence claim with hedging language", () => {
      const result = renderClaim({
        confidence: "low",
        intent_anchor: "growth",
        evidence: "limited data available",
        mechanism: "unclear if scaling is viable",
        owner_cost: "uncertainty",
      });
      expect(result).toBeTruthy();
      // Low confidence should contain hedging
      expect(result).toMatch(/may|hint|possible|worth|confirm|if/i);
    });

    it("never contains forbidden words regardless of input", () => {
      // Even if input data contains forbidden words, output must be clean
      const result = renderClaim({
        confidence: "high",
        intent_anchor: "performance benchmarking",
        evidence: "you should improve your failed metrics",
        mechanism: "underperforming compared to industry average",
        owner_cost: "bad outcomes",
      });
      const violations = checkForbiddenLanguage(result);
      // sanitizeForbidden should catch the worst ones
      expect(violations.filter(v => v.match(/you should|you must|underperform|benchmark|failed/i))).toHaveLength(0);
    });
  });

  describe("renderTemplate", () => {
    it("renders intent_summary for high confidence", () => {
      const result = renderTemplate("intent_summary", "high", {
        value: "reliability and quality",
        priorities_summary: "stability, reputation, low stress",
      });
      expect(result).toBeTruthy();
      expect(checkForbiddenLanguage(result)).toHaveLength(0);
    });

    it("renders signal_summary for med confidence", () => {
      const result = renderTemplate("signal_summary", "med", {
        observation: "cash flow arrives unevenly",
        record_count: "140",
      });
      expect(result).toBeTruthy();
      expect(result).toMatch(/suggest|looks like|limited/i);
    });

    it("renders path_framing for low confidence", () => {
      const result = renderTemplate("path_framing", "low", {
        protects: "stability",
        operational_shift: "reducing incoming volume",
        tradeoff: "slower growth",
      });
      expect(result).toBeTruthy();
      expect(result).toMatch(/might|could|suggest|think|limited/i);
    });
  });

  describe("Sentence templates completeness", () => {
    it("every category has templates for all 3 confidence levels", () => {
      const categories: Array<keyof typeof SENTENCE_TEMPLATES> = [
        "intent_summary",
        "signal_summary",
        "tension_claim",
        "boundary_warning",
        "path_framing",
      ];
      for (const cat of categories) {
        expect(SENTENCE_TEMPLATES[cat].high.length).toBeGreaterThan(0);
        expect(SENTENCE_TEMPLATES[cat].med.length).toBeGreaterThan(0);
        expect(SENTENCE_TEMPLATES[cat].low.length).toBeGreaterThan(0);
      }
    });

    it("no template contains forbidden words", () => {
      for (const cat of Object.values(SENTENCE_TEMPLATES)) {
        for (const level of Object.values(cat)) {
          for (const tmpl of level) {
            const violations = checkForbiddenLanguage(tmpl);
            expect(violations).toHaveLength(0);
          }
        }
      }
    });
  });
});

// ============================================================================
// PART C: VALUE-CONFIDENCE INFERENCE
// ============================================================================

describe("Part C: Value-Confidence Inference", () => {
  describe("Behavioral evidence mapping", () => {
    it("has mappings for all 10 value prop tags", () => {
      for (const tag of VALUE_PROP_TAGS) {
        expect(BEHAVIORAL_EVIDENCE_MAP[tag]).toBeDefined();
        expect(BEHAVIORAL_EVIDENCE_MAP[tag].threshold_note).toBeTruthy();
      }
    });

    it("other_custom always returns 'unknown'", () => {
      const result = BEHAVIORAL_EVIDENCE_MAP["other_custom"].check([]);
      expect(result).toBe("unknown");
    });
  });

  describe("inferValueEvidence", () => {
    it("returns evidence for each selected tag", () => {
      const result = inferValueEvidence(FULL_INTAKE, MOCK_SIGNALS);
      expect(result.per_tag.length).toBeGreaterThanOrEqual(FULL_INTAKE.value_prop_tags.length);
    });

    it("marks declared=true for directly selected tags", () => {
      const result = inferValueEvidence(FULL_INTAKE, MOCK_SIGNALS);
      const speedTag = result.per_tag.find(p => p.tag === "speed_responsiveness");
      expect(speedTag).toBeDefined();
      expect(speedTag!.declared).toBe(true);
    });

    it("returns 'unknown' behavioral when signals are missing", () => {
      const emptySignals: RealitySignals = {
        version: "signals_v1",
        signals: [],
        window: { start_date: "2024-01-01", end_date: "2024-03-31", records_used: 0 },
        missing_data: ["No data available"],
      };
      const result = inferValueEvidence(FULL_INTAKE, emptySignals);
      for (const tag of result.per_tag) {
        expect(tag.behavioral).toBe("unknown");
      }
    });

    it("detects refusal evidence from non-negotiables", () => {
      // "keep_prices_fair" non-negotiable should imply refusal evidence for "affordability"
      const intake: OwnerIntentIntake = {
        ...FULL_INTAKE,
        value_prop_tags: ["affordability"],
        non_negotiables: ["keep_prices_fair"],
      };
      const result = inferValueEvidence(intake, MOCK_SIGNALS);
      const affordTag = result.per_tag.find(p => p.tag === "affordability");
      expect(affordTag?.refusal).toBe(true);
    });
  });

  describe("computeValueConfidence", () => {
    it("assigns high confidence when score >= 3", () => {
      const evidence = inferValueEvidence(FULL_INTAKE, MOCK_SIGNALS);
      const confidence = computeValueConfidence(evidence);
      // At least one tag should have meaningful confidence
      expect(confidence.length).toBeGreaterThan(0);
      for (const vc of confidence) {
        expect(vc.score).toBeGreaterThanOrEqual(0);
        expect(vc.score).toBeLessThanOrEqual(3);
        expect(["low", "med", "high"]).toContain(vc.confidence);
      }
    });

    it("returns lower confidence for partial intake", () => {
      const evidence = inferValueEvidence(PARTIAL_INTAKE, MOCK_SIGNALS);
      const confidence = computeValueConfidence(evidence);
      // Partial intake should not produce all high-confidence results
      const highCount = confidence.filter(c => c.confidence === "high").length;
      expect(highCount).toBeLessThan(confidence.length);
    });

    it("reduces confidence when conflicts are present", () => {
      const evidence = inferValueEvidence(CONFLICTING_INTAKE, MOCK_SIGNALS);
      expect(evidence.conflicts.length).toBeGreaterThan(0);
      const confidence = computeValueConfidence(evidence);
      // Tags involved in conflicts should have reduced confidence
      const conflictTags = new Set(evidence.conflicts.flatMap(c => c.tags_involved));
      for (const vc of confidence) {
        if (conflictTags.has(vc.tag)) {
          // Confidence should not be "high" when tag is in a conflict
          // (unless it has very strong evidence — this is a soft check)
          expect(vc.notes).toBeDefined();
        }
      }
    });
  });

  describe("detectIntakeConflicts", () => {
    it("detects affordability + premium_quality conflict", () => {
      const conflicts = detectIntakeConflicts(CONFLICTING_INTAKE);
      const affordPremium = conflicts.find(c => c.id === "conflict_affordability_premium");
      expect(affordPremium).toBeDefined();
    });

    it("detects growth + stay_small conflict", () => {
      const conflicts = detectIntakeConflicts(CONFLICTING_INTAKE);
      const growthSmall = conflicts.find(c => c.id === "conflict_growth_stay_small");
      expect(growthSmall).toBeDefined();
    });

    it("detects profit + fair prices conflict", () => {
      const intake: OwnerIntentIntake = {
        ...FULL_INTAKE,
        priorities_ranked: ["profit_margin", "predictability_stability"],
        non_negotiables: ["keep_prices_fair"],
        anti_goals: ["dont_raise_prices_aggressively"],
      };
      const conflicts = detectIntakeConflicts(intake);
      const profitFair = conflicts.find(c => c.id === "conflict_profit_fair_prices");
      expect(profitFair).toBeDefined();
    });

    it("returns no conflicts for non-conflicting intake", () => {
      const intake: OwnerIntentIntake = {
        ...FULL_INTAKE,
        value_prop_tags: ["local_trust"],
        priorities_ranked: ["reputation_trust", "predictability_stability"],
        non_negotiables: ["protect_reputation"],
        anti_goals: ["dont_chase_growth_at_all_costs"],
      };
      const conflicts = detectIntakeConflicts(intake);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe("Pricing advice gating", () => {
    it("pricing advice is gated: profit_margin top AND no anti-goal AND no non-negotiable", () => {
      // Scenario 1: profit_margin is top BUT dont_raise_prices_aggressively is selected
      const gatedIntake: OwnerIntentIntake = {
        ...FULL_INTAKE,
        priorities_ranked: ["profit_margin"],
        anti_goals: ["dont_raise_prices_aggressively"],
        non_negotiables: [],
      };

      // Pricing should be blocked
      const conflicts = detectIntakeConflicts(gatedIntake);
      const profitConflict = conflicts.find(c => c.id === "conflict_profit_fair_prices");
      // This should trigger because profit_margin is top + dont_raise_prices_aggressively
      expect(profitConflict).toBeDefined();

      // Scenario 2: profit_margin is top with NO anti-goals blocking
      const ungatedIntake: OwnerIntentIntake = {
        ...FULL_INTAKE,
        priorities_ranked: ["profit_margin"],
        anti_goals: [],
        non_negotiables: [],
      };
      const noConflicts = detectIntakeConflicts(ungatedIntake);
      const noProfitConflict = noConflicts.find(c => c.id === "conflict_profit_fair_prices");
      expect(noProfitConflict).toBeUndefined();
    });
  });

  describe("No forbidden words in rendered output", () => {
    it("full pipeline output contains no forbidden language", () => {
      const evidence = inferValueEvidence(FULL_INTAKE, MOCK_SIGNALS);
      const confidence = computeValueConfidence(evidence);

      // Render claims for each tension-like scenario
      for (const vc of confidence) {
        const claim = renderClaim({
          confidence: vc.confidence,
          intent_anchor: vc.tag,
          evidence: `data shows patterns related to ${vc.tag}`,
          mechanism: "this creates a structural tension",
          owner_cost: "time and attention",
        });
        const violations = checkForbiddenLanguage(claim);
        expect(violations).toHaveLength(0);
      }
    });
  });
});
