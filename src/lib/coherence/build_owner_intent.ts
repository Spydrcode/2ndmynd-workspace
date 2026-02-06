/**
 * buildOwnerIntentModel — Normalize raw intake into a structured OwnerIntentModel
 *
 * DOCTRINE:
 * - Accept intent as-is. Do NOT rewrite, optimize, or "improve."
 * - Detect contradictions; flag them with reduced confidence, not judgment.
 * - Tags are normalized lowercase, deduped.
 */

import type { OwnerIntentModel, IntentConfidence } from "../types/coherence_engine";

export type IntentIntake = {
  value_proposition_statement: string;
  value_proposition_tags?: string[];
  priorities_ranked: string[];
  non_negotiables?: string[];
  boundaries?: {
    time?: string;
    stress?: string;
    risk?: string;
    reputation?: string;
    compliance?: string;
  };
  definition_of_success: string;
  anti_goals?: string[];
  context_notes?: string;
};

/** Known contradiction pairs — if both appear in priorities or non-negotiables, flag. */
const CONTRADICTION_PAIRS: [RegExp, RegExp, string][] = [
  [/low(est)?\s*cost|cheap|affordab/i, /white\s*glove|premium|luxury/i,
    "Low-cost positioning may conflict with premium service expectations."],
  [/no\s*stress|calm|peace/i, /rapid\s*growth|scale\s*fast|aggressive/i,
    "Seeking calm while pursuing rapid growth creates tension."],
  [/no\s*debt|no\s*risk|conservative/i, /grow\s*fast|expand|scale/i,
    "Conservative risk appetite may limit growth speed."],
  [/work.life\s*balance|no\s*weekends|limit.*hours/i, /never\s*miss|always\s*available|24.7/i,
    "Boundaries on hours may conflict with always-available service."],
];

function normalizeTags(raw: string[]): string[] {
  return [...new Set(raw.map(t => t.trim().toLowerCase()).filter(Boolean))];
}

function detectContradictions(intake: IntentIntake): string[] {
  const contradictions: string[] = [];
  const allText = [
    ...intake.priorities_ranked,
    ...(intake.non_negotiables ?? []),
    intake.value_proposition_statement,
    intake.definition_of_success,
    ...(intake.anti_goals ?? []),
  ].join(" ");

  for (const [patternA, patternB, message] of CONTRADICTION_PAIRS) {
    if (patternA.test(allText) && patternB.test(allText)) {
      contradictions.push(message);
    }
  }
  return contradictions;
}

function determineConfidence(intake: IntentIntake, contradictions: string[]): IntentConfidence {
  if (contradictions.length >= 2) return "low";
  if (contradictions.length === 1) return "med";
  if (!intake.value_proposition_statement?.trim()) return "med";
  if (intake.priorities_ranked.length === 0) return "low";
  return "high";
}

export function buildOwnerIntentModel(intake: IntentIntake): OwnerIntentModel {
  const contradictions = detectContradictions(intake);
  const confidence = determineConfidence(intake, contradictions);

  return {
    version: "intent_v2",
    value_proposition: {
      statement: intake.value_proposition_statement.trim(),
      tags: normalizeTags(intake.value_proposition_tags ?? []),
    },
    priorities_ranked: intake.priorities_ranked.map(p => p.trim()).filter(Boolean),
    non_negotiables: (intake.non_negotiables ?? []).map(n => n.trim()).filter(Boolean),
    boundaries: intake.boundaries ?? {},
    definition_of_success: intake.definition_of_success.trim(),
    anti_goals: (intake.anti_goals ?? []).map(a => a.trim()).filter(Boolean),
    context_notes: intake.context_notes?.trim() || undefined,
    confidence,
    detected_contradictions: contradictions.length > 0 ? contradictions : undefined,
    captured_at: new Date().toISOString(),
  };
}
