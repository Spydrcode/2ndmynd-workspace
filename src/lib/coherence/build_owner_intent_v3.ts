/**
 * buildOwnerIntentModel — Normalize raw intake into a structured OwnerIntentModel (v3)
 *
 * DOCTRINE:
 * - Accept intent as-is. Do NOT rewrite, optimize, or "improve."
 * - Detect conflicts; flag them with reduced confidence, not judgment.
 * - Support both the new OwnerIntentIntake (7-question) and the legacy IntentIntake.
 */

import type {
  OwnerIntentIntake,
  OwnerIntentModel,
  IntentConfidence,
  ValuePropTag,
  PriorityTag,
  NonNegotiableTag,
  AntiGoalTag,
  ConstraintTag,
} from "../types/intent_intake";
import { VALUE_PROP_LABELS as VP_LABELS } from "../types/intent_intake";
import { detectIntakeConflicts } from "./value_confidence";

// ============================================================================
// LEGACY INTAKE TYPE (backward compat for existing callers)
// ============================================================================

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

// ============================================================================
// BUILD FROM NEW 7-QUESTION INTAKE
// ============================================================================

export function buildFromIntake(intake: OwnerIntentIntake): OwnerIntentModel {
  // Build a human-readable statement from tags
  const tagLabels = intake.value_prop_tags
    .filter(t => t !== "other_custom")
    .map(t => VP_LABELS[t]?.toLowerCase() ?? t);
  const otherText = intake.value_prop_other?.trim();
  const parts = [...tagLabels];
  if (otherText) parts.push(otherText);
  const statement = parts.length > 0
    ? `Customers choose us because ${parts.join(" and ")}.`
    : "Value proposition not yet described.";

  const conflicts = detectIntakeConflicts(intake);
  const confidence = determineConfidenceFromIntake(intake, conflicts.length);

  return {
    version: "intent_v3",
    value_proposition: {
      statement,
      tags: [...intake.value_prop_tags],
    },
    priorities_ranked: [...intake.priorities_ranked],
    non_negotiables: [...intake.non_negotiables],
    anti_goals: [...intake.anti_goals],
    primary_constraint: intake.primary_constraint,
    definition_of_success: intake.success_90d.trim(),
    context_notes: intake.context_notes?.trim() || undefined,
    confidence,
    detected_conflicts: conflicts,
    captured_at: intake.collected_at || new Date().toISOString(),
  };
}

function determineConfidenceFromIntake(
  intake: OwnerIntentIntake,
  conflictCount: number
): IntentConfidence {
  // Count answered questions
  let answered = 0;
  if (intake.value_prop_tags.length > 0) answered++;
  if (intake.priorities_ranked.length > 0) answered++;
  if (intake.non_negotiables.length > 0) answered++;
  if (intake.anti_goals.length > 0) answered++;
  if (intake.primary_constraint) answered++;
  if (intake.success_90d?.trim()) answered++;
  if (intake.context_notes?.trim()) answered++;

  if (conflictCount >= 2) return "low";
  if (conflictCount >= 1 && answered < 5) return "low";
  if (conflictCount >= 1) return "med";
  if (answered >= 5) return "high";
  if (answered >= 3) return "med";
  return "low";
}

// ============================================================================
// BUILD FROM LEGACY INTAKE (backward compat — preserved from v2)
// ============================================================================

/** Known contradiction pairs for legacy intake text — flag, don't judge. */
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

/**
 * Legacy builder — accepts old-format IntentIntake, produces an OwnerIntentModel (v3-ish).
 * For callers that haven't migrated to the 7-question intake yet.
 */
export function buildOwnerIntentModel(intake: IntentIntake): OwnerIntentModel {
  const contradictions = detectContradictions(intake);
  const confidence = determineConfidence(intake, contradictions);

  return {
    version: "intent_v3",
    value_proposition: {
      statement: intake.value_proposition_statement.trim(),
      tags: normalizeTags(intake.value_proposition_tags ?? []) as unknown as ValuePropTag[],
    },
    priorities_ranked: intake.priorities_ranked.map(p => p.trim()).filter(Boolean) as unknown as PriorityTag[],
    non_negotiables: (intake.non_negotiables ?? []).map(n => n.trim()).filter(Boolean) as unknown as NonNegotiableTag[],
    anti_goals: (intake.anti_goals ?? []).map(a => a.trim()).filter(Boolean) as unknown as AntiGoalTag[],
    primary_constraint: "owner_bottleneck_decisions" as unknown as ConstraintTag, // default for legacy
    definition_of_success: intake.definition_of_success.trim(),
    context_notes: intake.context_notes?.trim() || undefined,
    confidence,
    detected_conflicts: contradictions.map((c, i) => ({
      id: `legacy_conflict_${i}`,
      tags_involved: [],
      description: c,
    })),
    captured_at: new Date().toISOString(),
  };
}
