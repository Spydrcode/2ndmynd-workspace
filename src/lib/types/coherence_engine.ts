/**
 * Coherence Engine Types — Intent → Tension → Choice
 *
 * DOCTRINE:
 * - We are NOT a dashboard/KPI/benchmarking company.
 * - Do NOT compare the business to industry averages, peers, competitors, or "ideal shapes."
 * - Do NOT imply profit-maximization is the default goal.
 * - The system interprets CSV reality against the owner's stated values and value proposition.
 * - Outputs must be calm, non-judgmental, and anchored to the owner's own intent.
 */

// ============================================================================
// OWNER INTENT MODEL (expanded from the old OwnerIntentProfile)
// ============================================================================

export type IntentConfidence = "low" | "med" | "high";

export type OwnerIntentModel = {
  version: "intent_v2";
  /** The owner's value proposition — what they want to deliver to their customers. */
  value_proposition: {
    statement: string;
    tags: string[]; // e.g. ["reliability", "same-day service", "quality"]
  };
  /** Owner's ranked priorities — most important first. */
  priorities_ranked: string[]; // e.g. ["safety", "communication", "affordability"]
  /** Things the owner will not compromise on, no matter what. */
  non_negotiables: string[];
  /** Boundaries the owner places on themselves or the business. */
  boundaries: {
    time?: string;    // e.g. "I work 6am–4pm, no weekends"
    stress?: string;  // e.g. "I need to stop firefighting every day"
    risk?: string;    // e.g. "No debt, no big bets right now"
    reputation?: string; // e.g. "We never leave a job unfinished"
    compliance?: string; // e.g. "Licensed, insured, by the book"
  };
  /** What does "winning" look like for this owner? */
  definition_of_success: string;
  /** What the owner explicitly does NOT want. */
  anti_goals: string[];
  /** Free-form context that didn't fit elsewhere. */
  context_notes?: string;
  /** How consistently/clearly the owner articulated their intent. */
  confidence: IntentConfidence;
  /** Detected contradictions in the intake, if any. */
  detected_contradictions?: string[];
  /** Structured conflicts from the 7-question intake (v3). */
  detected_conflicts?: Array<{
    id: string;
    tags_involved: string[];
    description: string;
  }>;
  /** Per-tag value-prop confidence (computed after CSV signals). */
  value_confidence?: Array<{
    tag: string;
    score: number;
    confidence: IntentConfidence;
    sources: { declared: boolean; behavioral: boolean | "unknown"; refusal: boolean };
    notes?: string[];
  }>;
  /** The owner's primary constraint (from Q5 of 7-question intake). */
  primary_constraint?: string;
  captured_at: string;
};

// ============================================================================
// REALITY SIGNALS (neutral observations — no judgment)
// ============================================================================

export type SignalConfidence = "low" | "med" | "high";

export type RealitySignal = {
  id: string; // e.g. "sig_concentration_customer"
  category: "volume" | "timing" | "concentration" | "capacity" | "cash" | "owner_dependency" | "rhythm";
  observation: string; // Neutral, present-tense. e.g. "5 customers account for 72% of invoiced revenue."
  magnitude: number; // 0-100, how large the effect is (not good/bad — just how big)
  confidence: SignalConfidence;
  data_points: Record<string, unknown>; // supporting numbers
};

export type RealitySignals = {
  version: "signals_v1";
  signals: RealitySignal[];
  window: {
    start_date: string;
    end_date: string;
    records_used: number;
  };
  missing_data: string[];
};

// ============================================================================
// COHERENCE TENSION (mapped conflict between intent and reality)
// ============================================================================

export type CoherenceTension = {
  id: string; // e.g. "tension_concentration_vs_stability"
  /** Which part of the owner's intent is being tested. */
  intent_anchor: string; // e.g. "You value stability"
  /** A calm, complete statement of the tension. */
  claim: string; // e.g. "You value stability, but 3 customers make up 68% of revenue, which means losing one could force sudden changes."
  /** Evidence grounding. */
  evidence: {
    signal_ids: string[];
    data_points: Record<string, unknown>;
  };
  /** Why this tension structurally exists (not a moral judgment). */
  mechanism: string;
  /** What the owner is paying (time, stress, risk, reputation, compliance). */
  owner_cost: string;
  /** How severe this tension is (0-100). Weighted by the priority rank of the intent_anchor. */
  severity: number;
  confidence: IntentConfidence;
  /** Questions that would need to be true for a proposed resolution to work. */
  what_must_be_true: string[];
};

// ============================================================================
// DECISION PATH (A, B, or Neither — grounded in intent + tensions)
// ============================================================================

export type EffortLevel = "low" | "med" | "high";

export type SevenDayStep = {
  title: string;
  why: string;
  how: string;
  effort: EffortLevel;
};

export type DecisionPathCoherence = {
  name: "path_A" | "path_B" | "neither";
  /** What this path is about in one sentence. */
  thesis: string;
  /** Which owner priorities this path protects. */
  protects: string[];
  /** What the owner gives up or accepts by choosing this path. */
  trades_off: string[];
  /** Value-prop labels this path protects (anchored to intent). */
  protects_values?: string[];
  /** Value-prop labels this path relaxes or deprioritizes (anchored to intent). */
  relaxes_values?: string[];
  /** Concrete changes in how the business operates. */
  operational_shift: string[];
  /** Known risks of this path. */
  risks: string[];
  /** 2-4 small, doable steps for the first 7 days. */
  seven_day_plan: {
    steps: SevenDayStep[];
  };
  /** What to revisit at 30 days. */
  thirty_day_followup: {
    title: string;
    why: string;
  };
  /** A boundary the owner should watch. If this boundary is crossed, reconsider. */
  boundary_warning: string;
};

// ============================================================================
// VALUE-PROP ALIGNMENT (sits between signals and tensions)
// ============================================================================

export type SupportStatus = "supported" | "mixed" | "crowded_out" | "unknown";

export type ValuePropAlignment = {
  /** The value-prop tag from OwnerIntentIntake or OwnerIntentModel. */
  tag: string;
  /** Human-readable label. */
  label: string;
  /** Confidence that this alignment assessment is accurate. */
  confidence: IntentConfidence;
  /** Which evidence sources contributed. */
  sources: {
    declared: boolean;
    behavioral: boolean | "unknown";
    refusal: boolean;
  };
  /** Numeric score (0–3): 0 = no evidence, 3 = all three sources align. */
  score: number;
  /** Overall support status: is this value prop supported / mixed / crowded out / unknown? */
  support: SupportStatus;
  /** Evidence grounding: signal IDs + human-readable bullets. */
  evidence: {
    signal_ids: string[];
    bullets: string[];
  };
  /** A gentle check-in question for low-confidence or crowded-out items (optional). */
  gentle_check?: string;
  /** Internal notes for dev/debugging (optional). */
  notes?: string[];
};

// ============================================================================
// DATA COVERAGE (Task 1) — what we can and can't see
// ============================================================================

export type CoverageSource = "quotes" | "invoices" | "calendar" | "expenses" | "estimates";

export type CoverageStatus = "present" | "partial" | "absent";

export type DataCoverage = {
  sources: Array<{
    name: CoverageSource;
    status: CoverageStatus;
    record_count: number;
    /** Calm, structural note — e.g. "80 invoices in this window" or "No calendar data provided." */
    note: string;
  }>;
  /** Plain-language overall note (no judgment, no benchmarks). */
  overall_note: string;
};

/**
 * Visibility impact — how data gaps affect each value-prop's alignment visibility.
 * One entry per value-prop tag.
 */
export type ValueVisibilityImpact = {
  tag: string;
  label: string;
  /** Can we see this value clearly with the data provided? */
  visibility: "clear" | "partial" | "limited";
  /** Calm reason — e.g. "No scheduling data to observe response-time patterns." */
  reason: string;
};

// ============================================================================
// COHERENCE SNAPSHOT (the primary output artifact)
// ============================================================================

export type CoherenceSnapshot = {
  version: "coherence_v1";
  run_id: string;
  created_at: string;
  /** S1: Normalized owner intent */
  intent: OwnerIntentModel;
  /** S1: Neutral reality signals from CSV data */
  signals: RealitySignals;
  /** S1.5: Value-prop alignment layer (between signals and tensions) */
  value_prop_alignment: ValuePropAlignment[];
  /** S2: Where intent and reality conflict */
  tensions: CoherenceTension[];
  /** S3: Two paths + neither */
  paths: DecisionPathCoherence[];
  /** Data coverage card (what sources are present / absent). */
  data_coverage?: DataCoverage;
  /** Per-value-prop visibility impact (how gaps affect alignment confidence). */
  value_visibility?: ValueVisibilityImpact[];
  /** Pipeline state (same behavior as before) */
  end_state: {
    state: "awaiting_commitment" | "committed" | "clean_exit" | "under_review" | "pivot_required";
    reason?: string;
    timestamp: string;
  };
  /** Optional review metadata for monthly runs. */
  review?: {
    drift?: CoherenceDrift;
  };
  /** Confidence in the overall output. */
  confidence: {
    level: IntentConfidence;
    reason: string;
  };
};

// ============================================================================
// MONTHLY REVIEW — COHERENCE DRIFT (Task 3)
// ============================================================================

/**
 * Change in alignment status between two snapshots.
 */
export type AlignmentDelta = {
  tag: string;
  label: string;
  prior_support: SupportStatus;
  current_support: SupportStatus;
  direction: "improved" | "unchanged" | "declined";
  note: string;
};

/**
 * Change in tension severity between two snapshots.
 */
export type TensionShift = {
  tension_id: string;
  intent_anchor: string;
  prior_severity: number;
  current_severity: number;
  direction: "eased" | "unchanged" | "worsened";
  note: string;
};

/**
 * Full drift narrative comparing two coherence snapshots.
 */
export type CoherenceDrift = {
  version: "drift_v1";
  previous_run_id: string;
  current_run_id: string;
  days_between: number;
  alignment_deltas: AlignmentDelta[];
  tension_shifts: TensionShift[];
  /** Plain-language summary of what changed (no judgment). */
  summary: string;
  /** Notes about structural changes (new tensions, resolved tensions, etc.). */
  structural_notes: string[];
  /** One calm question the owner should consider next. */
  what_to_decide_now: string;
};

// ============================================================================
// LEGACY MONTHLY REVIEW (tension-tracking, not benchmark-tracking)
// ============================================================================

export type TensionDelta = {
  tension_id: string;
  prior_severity: number;
  current_severity: number;
  direction: "eased" | "unchanged" | "worsened";
  note: string;
};

export type CoherenceReview = {
  version: "review_v1";
  review_date: string;
  days_since_commitment: number;
  tension_deltas: TensionDelta[];
  path_still_coherent: boolean;
  pivot_recommendation: "continue" | "adjust" | "pivot" | "end";
  reasoning: string;
};
