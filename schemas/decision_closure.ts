/**
 * 2ndmynd Decision Closure Artifact Schemas
 * 
 * DOCTRINE: These schemas enforce the decision closure contract.
 * - Max 2 decision paths
 * - Explicit non-actions required
 * - Finite conclusions, not dashboards
 * - Monthly validation support
 */

import { z } from "zod";

// ============================================================================
// SYSTEM 0: Owner Intent Capture
// ============================================================================

export const ownerPrioritySchema = z.enum([
  "stability",
  "profit",
  "growth",
  "time_relief",
  "predictability",
]);

export const riskAppetiteSchema = z.enum(["low", "medium", "high"]);
export const changeAppetiteSchema = z.enum(["incremental", "structural"]);
export const timeHorizonSchema = z.enum(["30_days", "90_days", "180_days", "365_days"]);

export const ownerIntentProfileSchema = z.object({
  profile_version: z.literal("intent_v1"),
  primary_priority: ownerPrioritySchema,
  risk_appetite: riskAppetiteSchema,
  change_appetite: changeAppetiteSchema,
  non_negotiables: z.array(z.string()).max(5),
  time_horizon: timeHorizonSchema,
  captured_at: z.string(),
});

export type OwnerIntentProfile = z.infer<typeof ownerIntentProfileSchema>;

// ============================================================================
// SYSTEM 1: Business Reality Reconstruction
// ============================================================================

export const concentrationSignalSchema = z.object({
  source: z.enum(["customer", "job_type", "season"]),
  concentration_pct: z.number().min(0).max(100),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  description: z.string(),
});

export const capacitySignalSchema = z.object({
  signal_type: z.enum(["demand_exceeds_capacity", "capacity_exceeds_demand", "balanced"]),
  severity: z.enum(["low", "medium", "high"]),
  evidence: z.string(),
});

export const ownerDependencySignalSchema = z.object({
  dependency_type: z.enum(["approval_bottleneck", "hero_dynamic", "non_repeatable_work", "decision_fatigue"]),
  frequency: z.enum(["occasional", "frequent", "constant"]),
  impact: z.string(),
});

export const businessRealityModelSchema = z.object({
  model_version: z.literal("reality_v1"),
  business_type_detected: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  concentration_signals: z.array(concentrationSignalSchema).max(5),
  seasonality_pattern: z.enum(["none", "weak", "moderate", "strong"]),
  capacity_signals: z.array(capacitySignalSchema).max(3),
  owner_dependency: z.array(ownerDependencySignalSchema).max(4),
  volatility_drivers: z.array(z.string()).max(5),
  missing_data_notes: z.array(z.string()).optional(),
  reconstructed_at: z.string(),
});

export type BusinessRealityModel = z.infer<typeof businessRealityModelSchema>;

// ============================================================================
// SYSTEM 2: Structural Diagnosis (Multi-lens Findings)
// ============================================================================

export const lensTypeSchema = z.enum(["e_myth", "porter_lite", "blue_ocean", "financial_shape"]);

export const structuralFindingSchema = z.object({
  lens: lensTypeSchema,
  finding_id: z.string(),
  finding_summary: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  evidence: z.array(z.string()).min(1).max(3),
  contributes_to_pressure: z.boolean(),
});

export const primaryConstraintSchema = z.object({
  constraint_id: z.string(),
  constraint_description: z.string(),
  downstream_noise: z.array(z.string()).max(5),
  why_primary: z.string(),
});

export type StructuralFinding = z.infer<typeof structuralFindingSchema>;
export type PrimaryConstraint = z.infer<typeof primaryConstraintSchema>;

// ============================================================================
// SYSTEM 3: Decision Path Generator (MAX 2 PATHS)
// ============================================================================

export const decisionPathSchema = z.object({
  path_id: z.enum(["A", "B"]),  // DOCTRINE: Only A or B allowed
  path_name: z.string().max(100),
  pressure_resolved: z.string(),
  trade_offs: z.array(z.string()).min(1).max(3),
  fits_owner_profile: z.string(),
  proof_of_concept_signals: z.array(z.object({
    signal: z.string(),
    time_window_days: z.number().min(7).max(180),
    expected_outcome: z.string(),
  })).min(1).max(3),
  exit_conditions: z.array(z.string()).min(1).max(3),
  confidence: z.enum(["low", "medium", "high"]),
});

export type DecisionPath = z.infer<typeof decisionPathSchema>;

// DOCTRINE ENFORCEMENT: Max 2 paths
export const decisionPathsArraySchema = z.array(decisionPathSchema).min(1).max(2);

// ============================================================================
// SYSTEM 4: Commitment + Action Plan + Accountability
// ============================================================================

export const commitmentGateSchema = z.object({
  owner_choice: z.enum(["path_A", "path_B", "neither"]),
  commitment_made: z.boolean(),
  chosen_at: z.string().optional(),
  reason_if_declined: z.string().optional(),
});

export const endStateSchema = z.object({
  state: z.enum(["awaiting_commitment", "committed", "clean_exit", "under_review", "pivot_required"]),
  reason: z.string().optional(),
  timestamp: z.string(),
});

export const commitmentPlanSchema = z.object({
  plan_version: z.literal("commitment_v1"),
  chosen_path: z.enum(["A", "B"]),
  time_box_days: z.number().min(30).max(180),
  minimal_actions: z.array(z.object({
    action: z.string(),
    deadline_days: z.number(),
    responsible: z.enum(["owner", "team", "external"]),
  })).min(1).max(5),
  // DOCTRINE: Explicit non-actions required
  explicit_non_actions: z.array(z.string()).min(1).max(5),
  created_at: z.string(),
});

export const accountabilitySpecSchema = z.object({
  spec_version: z.literal("accountability_v1"),
  re_evaluation_triggers: z.array(z.object({
    trigger: z.string(),
    check_frequency_days: z.number(),
    trigger_fired: z.boolean().default(false),
  })).min(1).max(3),
  failure_conditions: z.array(z.string()).min(1).max(3),
  success_metrics: z.array(z.object({
    metric: z.string(),
    target: z.string(),
  })).min(1).max(3),
  created_at: z.string(),
});

export type CommitmentGate = z.infer<typeof commitmentGateSchema>;
export type CommitmentPlan = z.infer<typeof commitmentPlanSchema>;
export type AccountabilitySpec = z.infer<typeof accountabilitySpecSchema>;

// ============================================================================
// SYSTEM 5: Outcome Validation (Monthly Review)
// ============================================================================

export const implementationStatusSchema = z.enum([
  "fully_implemented",
  "partially_implemented",
  "not_implemented",
  "blocked",
]);

export const strategyAssessmentSchema = z.enum([
  "working_as_expected",
  "working_partially",
  "not_working",
  "too_early_to_tell",
]);

export const outcomeReviewSchema = z.object({
  review_version: z.literal("outcome_v1"),
  review_date: z.string(),
  days_since_commitment: z.number(),
  implementation_status: implementationStatusSchema,
  strategy_assessment: strategyAssessmentSchema,
  expected_signals_comparison: z.array(z.object({
    signal: z.string(),
    expected: z.string(),
    actual: z.string(),
    met: z.boolean(),
  })).min(1),
  pressure_change: z.enum(["reduced", "unchanged", "increased"]),
  pivot_recommendation: z.enum(["continue", "adjust", "pivot", "end"]),
  reasoning: z.string(),
});

export type OutcomeReview = z.infer<typeof outcomeReviewSchema>;

// ============================================================================
// DOCTRINE CHECKS (Pass/Fail Enforcement)
// ============================================================================

export const doctrineChecksSchema = z.object({
  checks_version: z.literal("doctrine_v1"),
  max_two_paths_enforced: z.boolean(),
  non_actions_present: z.boolean(),
  forbidden_language_absent: z.boolean(),
  commitment_gate_valid: z.boolean(),
  conclusions_locked_unless_triggered: z.boolean(),
  all_checks_passed: z.boolean(),
  failed_checks: z.array(z.string()),
});

export type DoctrineChecks = z.infer<typeof doctrineChecksSchema>;

// ============================================================================
// FINAL ARTIFACT: Decision Closure Artifact
// ============================================================================

export const lockedStateSchema = z.object({
  client_id: z.string(),
  locked_conclusions: z.array(z.object({
    conclusion_id: z.string(),
    constraint_id: z.string(),
    chosen_path: z.enum(["A", "B"]),
    locked_at: z.string(),
    unlock_triggers: z.array(z.string()),
    trigger_fired: z.boolean().default(false),
  })),
  last_updated: z.string(),
});

export type LockedState = z.infer<typeof lockedStateSchema>;

export const decisionClosureArtifactSchema = z.object({
  artifact_version: z.literal("closure_v1"),
  run_id: z.string(),
  client_id: z.string(),
  created_at: z.string(),
  owner_intent: ownerIntentProfileSchema,
  business_reality: businessRealityModelSchema,
  structural_findings: z.array(structuralFindingSchema).min(1).max(10),
  primary_constraint: primaryConstraintSchema,
  decision_paths: decisionPathsArraySchema,  // MAX 2 enforced
  commitment_gate: commitmentGateSchema,
  action_plan: commitmentPlanSchema.optional(),
  accountability: accountabilitySpecSchema.optional(),
  outcome_review: outcomeReviewSchema.optional(),
  doctrine_checks: doctrineChecksSchema,
  end_state: endStateSchema,
  // Prior locked conclusions (prevent flip-flopping)
  prior_conclusions_locked: z.array(z.object({
    conclusion_id: z.string(),
    locked_at: z.string(),
    unlock_triggers: z.array(z.string()),
  })).optional(),
});

export type DecisionClosureArtifact = z.infer<typeof decisionClosureArtifactSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateDecisionClosureArtifact(data: unknown): {
  valid: boolean;
  errors?: string[];
  artifact?: DecisionClosureArtifact;
} {
  const result = decisionClosureArtifactSchema.safeParse(data);
  if (result.success) {
    return { valid: true, artifact: result.data };
  }
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

// DOCTRINE ENFORCEMENT: Forbidden language patterns
export const FORBIDDEN_LANGUAGE_PATTERNS = [
  /\bdashboard\b/i,
  /\bKPI\b/i,
  /\bmetrics\s*tracking\b/i,
  /\bmonitor(ing)?\b/i,
  /\brealtime\b/i,
  /\breal-time\b/i,
  /\bBI\s*tool\b/i,
  /\banalytics\s*platform\b/i,
  /\bdata\s*visualization\b/i,
];

export function checkForbiddenLanguage(text: string): string[] {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_LANGUAGE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push(`Forbidden language detected: "${match[0]}"`);
    }
  }
  return violations;
}
