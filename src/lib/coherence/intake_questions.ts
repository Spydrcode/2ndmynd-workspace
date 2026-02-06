/**
 * 7-Question Intent Intake — End-User Copy + UI Spec
 *
 * DOCTRINE:
 * - Calm, plain language. No shaming. No right answers.
 * - 2–6 minutes total.
 * - Partial completion is accepted — missing answers reduce confidence, never block.
 * - Forced-choice where possible, with "Other" option on Q1.
 */

import type {
  ValuePropTag,
  PriorityTag,
  NonNegotiableTag,
  AntiGoalTag,
  ConstraintTag,
  VALUE_PROP_LABELS,
  PRIORITY_LABELS,
  NON_NEGOTIABLE_LABELS,
  ANTI_GOAL_LABELS,
  CONSTRAINT_LABELS,
} from "../types/intent_intake";

// ============================================================================
// QUESTION DEFINITIONS (exact end-user copy)
// ============================================================================

export type IntakeQuestionType = "checkbox" | "drag-rank" | "radio" | "textarea";

export type IntakeQuestion = {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  preamble: string; // shown above the input; normalizes "no right answer"
  type: IntakeQuestionType;
  required: boolean;
  validation: {
    minSelect?: number;
    maxSelect?: number;
    maxLength?: number;
    softRequired?: boolean; // if missing, lower confidence but allow submit
  };
};

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  // ──────────────────────────────────────────────────────
  // Q1. Value Proposition (checkbox, pick up to 2)
  // ──────────────────────────────────────────────────────
  {
    id: "value_prop_tags",
    number: 1,
    title: "Customers choose us because…",
    subtitle: "Pick the 1 or 2 that feel most true. There's no right answer.",
    preamble:
      "We're trying to understand what makes your business valuable to your customers — in your own words. Don't overthink it.",
    type: "checkbox",
    required: false,
    validation: {
      minSelect: 0,
      maxSelect: 2,
      softRequired: true,
    },
  },

  // ──────────────────────────────────────────────────────
  // Q2. Priorities (drag-rank, top 3)
  // ──────────────────────────────────────────────────────
  {
    id: "priorities_ranked",
    number: 2,
    title: "What are your top priorities right now?",
    subtitle: "Drag to rank your top 3. First = most important. There's no right answer.",
    preamble:
      "This helps us understand what matters most to you today — not forever, just right now.",
    type: "drag-rank",
    required: false,
    validation: {
      minSelect: 1,
      maxSelect: 3,
      softRequired: true,
    },
  },

  // ──────────────────────────────────────────────────────
  // Q3. Non-Negotiables (checkbox, pick up to 3)
  // ──────────────────────────────────────────────────────
  {
    id: "non_negotiables",
    number: 3,
    title: "What is non-negotiable for you?",
    subtitle: "Pick up to 3 things you won't bend on, no matter what. There's no right answer.",
    preamble:
      "These are your hard lines — the things that define how you run your business.",
    type: "checkbox",
    required: false,
    validation: {
      minSelect: 0,
      maxSelect: 3,
      softRequired: true,
    },
  },

  // ──────────────────────────────────────────────────────
  // Q4. Anti-Goals (checkbox, pick up to 3)
  // ──────────────────────────────────────────────────────
  {
    id: "anti_goals",
    number: 4,
    title: "What do you want to avoid?",
    subtitle: "Pick up to 3 things you definitely don't want. There's no right answer.",
    preamble:
      "Sometimes knowing what you don't want is just as useful as knowing what you do.",
    type: "checkbox",
    required: false,
    validation: {
      minSelect: 0,
      maxSelect: 3,
      softRequired: true,
    },
  },

  // ──────────────────────────────────────────────────────
  // Q5. Current Constraint (radio, pick 1)
  // ──────────────────────────────────────────────────────
  {
    id: "primary_constraint",
    number: 5,
    title: "Your current constraint (the thing that makes this feel heavy) is mostly:",
    subtitle: "Pick the one that resonates most. There's no right answer.",
    preamble:
      "Every business has a bottleneck. Naming it isn't admitting failure — it's where we start.",
    type: "radio",
    required: false,
    validation: {
      softRequired: true,
    },
  },

  // ──────────────────────────────────────────────────────
  // Q6. 90-Day Success (textarea, max 280 chars)
  // ──────────────────────────────────────────────────────
  {
    id: "success_90d",
    number: 6,
    title: "If things were working well 90 days from now, what would be true?",
    subtitle: "A sentence or two is plenty. There's no right answer.",
    preamble:
      "Paint a quick picture. What does 'better' look like for you?",
    type: "textarea",
    required: false,
    validation: {
      maxLength: 280,
      softRequired: true,
    },
  },

  // ──────────────────────────────────────────────────────
  // Q7. Context Notes (textarea, max 500 chars, optional)
  // ──────────────────────────────────────────────────────
  {
    id: "context_notes",
    number: 7,
    title: "Any context we should respect?",
    subtitle:
      "Compliance rules, service area limits, family schedule — anything that shapes what's realistic.",
    preamble:
      "This is optional. If there's something we should know before we interpret your data, share it here.",
    type: "textarea",
    required: false,
    validation: {
      maxLength: 500,
      softRequired: false,
    },
  },
];

// ============================================================================
// UI COMPONENT SPEC (for Next.js / shadcn implementation)
// ============================================================================

/**
 * Minimal UI spec for each question component:
 *
 * Q1 (checkbox):
 *   - Shadcn `Checkbox` group inside a `Card`
 *   - Max 2 selections enforced client-side (disable unchecked items when 2 selected)
 *   - If "other_custom" is selected, show a `Textarea` (max 120 chars) inline
 *   - Soft validation: if 0 selected, show a muted hint "Skipping this will reduce accuracy"
 *
 * Q2 (drag-rank):
 *   - Shadcn `Card` items inside a `@dnd-kit/sortable` drag container
 *   - User drags to rank top 3 from the full list of 10
 *   - Only the top 3 are submitted; remaining items are ignored
 *   - Fallback for mobile: numbered dropdown selects (1st, 2nd, 3rd)
 *   - Soft validation: at least 1 must be ranked
 *
 * Q3 (checkbox):
 *   - Shadcn `Checkbox` group inside a `Card`
 *   - Max 3 selections enforced client-side
 *   - Soft validation: 0 selected is allowed but reduces confidence
 *
 * Q4 (checkbox):
 *   - Same as Q3 (max 3 selections)
 *
 * Q5 (radio):
 *   - Shadcn `RadioGroup` inside a `Card`
 *   - Exactly 1 selection
 *   - Soft validation: skippable but flags low confidence
 *
 * Q6 (textarea):
 *   - Shadcn `Textarea` with character counter (max 280)
 *   - Placeholder: "e.g., 'I'd have steady work, be home by 5, and not worry about payroll.'"
 *
 * Q7 (textarea):
 *   - Shadcn `Textarea` with character counter (max 500)
 *   - Placeholder: "e.g., 'We're regulated by the state board. We only serve the metro area.'"
 *   - Explicitly labeled "Optional"
 *
 * FORM-LEVEL RULES:
 *   - All questions visible on one scrollable page (no multi-step wizard)
 *   - Submit button always enabled (partial completion OK)
 *   - On submit: compute `intake_completeness_score` (0–7 based on answered questions)
 *   - Show soft validation hints inline, never block submission
 *   - Progress indicator: "X of 7 answered" shown at bottom
 */

export function computeIntakeCompleteness(intake: Partial<{
  value_prop_tags: unknown[];
  priorities_ranked: unknown[];
  non_negotiables: unknown[];
  anti_goals: unknown[];
  primary_constraint: unknown;
  success_90d: string;
  context_notes: string;
}>): { score: number; max: 7; label: string } {
  let score = 0;
  if (intake.value_prop_tags && intake.value_prop_tags.length > 0) score++;
  if (intake.priorities_ranked && intake.priorities_ranked.length > 0) score++;
  if (intake.non_negotiables && intake.non_negotiables.length > 0) score++;
  if (intake.anti_goals && intake.anti_goals.length > 0) score++;
  if (intake.primary_constraint) score++;
  if (intake.success_90d && intake.success_90d.trim().length > 0) score++;
  if (intake.context_notes && intake.context_notes.trim().length > 0) score++;

  const label =
    score >= 6 ? "Strong"
    : score >= 4 ? "Good"
    : score >= 2 ? "Partial"
    : "Minimal";

  return { score, max: 7, label };
}
