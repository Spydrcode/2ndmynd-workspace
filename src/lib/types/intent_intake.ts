/**
 * Owner Intent Intake — 7-Question Schema + Types
 *
 * DOCTRINE:
 * - These are the EXACT tags that power inference. Do not rename IDs.
 * - The intake supports partial completion. Missing answers reduce confidence, never block.
 * - "There's no right answer" is the frame. No shaming, no judgment.
 */

// ============================================================================
// TAG ENUMS (exact IDs used by inference + tension rules)
// ============================================================================

export const VALUE_PROP_TAGS = [
  "speed_responsiveness",
  "affordability",
  "clarity_communication",
  "safety_compliance",
  "premium_quality",
  "availability_when_others_wont",
  "local_trust",
  "convenience_low_hassle",
  "relationship_care",
  "other_custom",
] as const;
export type ValuePropTag = (typeof VALUE_PROP_TAGS)[number];

export const PRIORITY_TAGS = [
  "profit_margin",
  "predictability_stability",
  "safety_compliance",
  "customer_experience",
  "speed_throughput",
  "craftsmanship_quality",
  "low_stress_owner",
  "time_freedom",
  "reputation_trust",
  "growth_scale",
] as const;
export type PriorityTag = (typeof PRIORITY_TAGS)[number];

export const NON_NEGOTIABLE_TAGS = [
  "no_safety_compromise",
  "no_pushy_sales",
  "no_quality_compromise",
  "keep_prices_fair",
  "protect_reputation",
  "protect_family_time",
  "stay_local_service_area",
  "stay_small_owner_led",
  "follow_regulations_strictly",
] as const;
export type NonNegotiableTag = (typeof NON_NEGOTIABLE_TAGS)[number];

export const ANTI_GOAL_TAGS = [
  "dont_scale_headcount",
  "dont_raise_prices_aggressively",
  "dont_take_debt",
  "dont_work_nights_weekends",
  "dont_accept_high_risk_jobs",
  "dont_upsell_unneeded",
  "dont_expand_service_area",
  "dont_chase_growth_at_all_costs",
] as const;
export type AntiGoalTag = (typeof ANTI_GOAL_TAGS)[number];

export const CONSTRAINT_TAGS = [
  "too_many_small_jobs",
  "not_enough_leads",
  "long_sales_cycle",
  "scheduling_chaos",
  "customer_communication_load",
  "compliance_pressure",
  "supplier_delays_materials",
  "cashflow_gaps",
  "owner_bottleneck_decisions",
  "staffing_gaps",
] as const;
export type ConstraintTag = (typeof CONSTRAINT_TAGS)[number];

// ============================================================================
// RAW INTAKE (exactly what the form submits)
// ============================================================================

export type OwnerIntentIntake = {
  intake_version: "0.2";
  collected_at: string; // ISO 8601

  /** Q1: "Customers choose us because…" (pick up to 2) */
  value_prop_tags: ValuePropTag[];

  /** Free-text if "other_custom" was selected */
  value_prop_other?: string;

  /** Q2: "Top priorities right now" (rank top 3 from list) */
  priorities_ranked: PriorityTag[];

  /** Q3: "What is non-negotiable for you?" (pick up to 3) */
  non_negotiables: NonNegotiableTag[];

  /** Q4: "What do you want to avoid?" (pick up to 3) */
  anti_goals: AntiGoalTag[];

  /** Q5: "Your current constraint is mostly…" (pick 1) */
  primary_constraint: ConstraintTag;

  /** Q6: "If things were working well 90 days from now, what would be true?" */
  success_90d: string;

  /** Q7: "Any context we should respect?" (optional) */
  context_notes?: string;
};

// ============================================================================
// NORMALIZED INTENT MODEL (enriched with confidence + conflicts)
// ============================================================================

export type IntentConfidence = "low" | "med" | "high";

export type IntentConflict = {
  id: string;
  tags_involved: string[];
  description: string;
};

export type ValuePropConfidence = {
  tag: ValuePropTag;
  score: number; // 0–3
  confidence: IntentConfidence;
  sources: {
    declared: boolean;
    behavioral: boolean | "unknown";
    refusal: boolean;
  };
  notes?: string[];
};

export type OwnerIntentModel = {
  version: "intent_v3";
  /** Value proposition: what they deliver to customers */
  value_proposition: {
    statement: string; // derived from tags + free-text
    tags: ValuePropTag[];
  };
  /** Ranked priorities (most important first) */
  priorities_ranked: PriorityTag[];
  /** Hard lines the owner won't cross */
  non_negotiables: NonNegotiableTag[];
  /** Things the owner explicitly wants to avoid */
  anti_goals: AntiGoalTag[];
  /** The "thing that makes this feel heavy" */
  primary_constraint: ConstraintTag;
  /** Owner's 90-day success vision */
  definition_of_success: string;
  /** Free-form context */
  context_notes?: string;
  /** How confidently the owner articulated intent */
  confidence: IntentConfidence;
  /** Detected contradictions in the intake */
  detected_conflicts: IntentConflict[];
  /** Per-tag value-prop confidence (computed after CSV signals are available) */
  value_confidence?: ValuePropConfidence[];
  captured_at: string;
};

// ============================================================================
// HUMAN-READABLE LABELS (for UI rendering)
// ============================================================================

// ── Value Override / Confirmation (Task 2) ──

/**
 * A single value-prop override from the owner.
 * - confirmed=true  → owner says "yes, this is still important"
 * - confirmed=false → owner says "this shifted / not a priority"
 */
export type ValueOverride = {
  tag: ValuePropTag;
  confirmed: boolean;
  /** When the override was recorded. */
  recorded_at: string;
};

/**
 * Per-run collection of intent overrides.
 * Stored alongside the run artifact.
 */
export type IntentOverrides = {
  run_id: string;
  overrides: ValueOverride[];
  updated_at: string;
};

// ============================================================================
// HUMAN-READABLE LABELS (for UI rendering) — continued
// ============================================================================

export const VALUE_PROP_LABELS: Record<ValuePropTag, string> = {
  speed_responsiveness: "We're fast — quick turnaround, quick replies",
  affordability: "We keep prices fair and accessible",
  clarity_communication: "We communicate clearly — no surprises",
  safety_compliance: "We're safe and compliant — by the book",
  premium_quality: "We deliver premium quality work",
  availability_when_others_wont: "We show up when others won't",
  local_trust: "We're trusted locally — people know us",
  convenience_low_hassle: "We make things easy — low hassle for the customer",
  relationship_care: "We build real relationships — customers feel valued",
  other_custom: "Something else (tell us)",
};

export const PRIORITY_LABELS: Record<PriorityTag, string> = {
  profit_margin: "Healthy profit margins",
  predictability_stability: "Predictable, steady work",
  safety_compliance: "Safety and regulatory compliance",
  customer_experience: "Great customer experience",
  speed_throughput: "Fast throughput — jobs flowing smoothly",
  craftsmanship_quality: "Craftsmanship and quality of work",
  low_stress_owner: "Less stress for me personally",
  time_freedom: "More time freedom / better hours",
  reputation_trust: "Strong reputation and trust",
  growth_scale: "Growing the business / scaling up",
};

export const NON_NEGOTIABLE_LABELS: Record<NonNegotiableTag, string> = {
  no_safety_compromise: "No compromising on safety",
  no_pushy_sales: "No pushy sales tactics",
  no_quality_compromise: "No cutting corners on quality",
  keep_prices_fair: "Keep our prices fair",
  protect_reputation: "Protect our reputation above all",
  protect_family_time: "Protect family time and personal boundaries",
  stay_local_service_area: "Stay within our current service area",
  stay_small_owner_led: "Stay small and owner-led",
  follow_regulations_strictly: "Follow all regulations strictly",
};

export const ANTI_GOAL_LABELS: Record<AntiGoalTag, string> = {
  dont_scale_headcount: "Don't grow the team size",
  dont_raise_prices_aggressively: "Don't raise prices aggressively",
  dont_take_debt: "Don't take on debt",
  dont_work_nights_weekends: "Don't work nights or weekends",
  dont_accept_high_risk_jobs: "Don't accept high-risk jobs",
  dont_upsell_unneeded: "Don't upsell things customers don't need",
  dont_expand_service_area: "Don't expand our service area",
  dont_chase_growth_at_all_costs: "Don't chase growth at all costs",
};

export const CONSTRAINT_LABELS: Record<ConstraintTag, string> = {
  too_many_small_jobs: "Too many small jobs, not enough bigger ones",
  not_enough_leads: "Not enough incoming leads or work",
  long_sales_cycle: "People take forever to decide / long sales cycle",
  scheduling_chaos: "Scheduling is a mess / too much juggling",
  customer_communication_load: "Too much time on customer communication",
  compliance_pressure: "Compliance / regulation pressure",
  supplier_delays_materials: "Supplier delays or material issues",
  cashflow_gaps: "Cash flow gaps — money comes in uneven",
  owner_bottleneck_decisions: "I'm the bottleneck — everything needs me",
  staffing_gaps: "Staffing issues — can't find or keep good people",
};
