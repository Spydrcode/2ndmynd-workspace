/**
 * DOCTRINE GATE: Decision Closure Validation
 * 
 * Enforces all doctrine rules before allowing artifact to pass.
 * BLOCKS promotion unless all checks pass.
 */

import {
  decisionClosureArtifactSchema,
  doctrineChecksSchema,
  checkForbiddenLanguage,
  type DecisionClosureArtifact,
  type DoctrineChecks,
} from "../../schemas/decision_closure";

export const tool = {
  name: "decision.validate_doctrine_v1",
  description: "Validate decision closure artifact against doctrine rules. Blocks invalid artifacts.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["artifact"],
    properties: {
      artifact: {
        type: "object",
        description: "DecisionClosureArtifact to validate",
      },
      strict: {
        type: "boolean",
        description: "If true, throw error on any violation. If false, return checks.",
      },
    },
  },
} as const;

export type ValidateDoctrineV1Args = {
  artifact: unknown;
  strict?: boolean;
};

export async function handler(args: ValidateDoctrineV1Args): Promise<{
  valid: boolean;
  doctrine_checks: DoctrineChecks;
  errors: string[];
}> {
  const errors: string[] = [];

  // 1. Schema validation
  const schemaResult = decisionClosureArtifactSchema.safeParse(args.artifact);
  if (!schemaResult.success) {
    errors.push(`Schema validation failed: ${schemaResult.error.message}`);
    return {
      valid: false,
      doctrine_checks: {
        checks_version: "doctrine_v1",
        max_two_paths_enforced: false,
        non_actions_present: false,
        forbidden_language_absent: false,
        commitment_gate_valid: false,
        conclusions_locked_unless_triggered: false,
        all_checks_passed: false,
        failed_checks: ["Schema validation failed"],
      },
      errors,
    };
  }

  const artifact = schemaResult.data as DecisionClosureArtifact;

  // 2. DOCTRINE CHECK: Max 2 decision paths
  const max_two_paths_enforced = artifact.decision_paths.length <= 2;
  if (!max_two_paths_enforced) {
    errors.push(`DOCTRINE VIOLATION: ${artifact.decision_paths.length} decision paths found. Max allowed: 2.`);
  }

  // 3. DOCTRINE CHECK: Explicit non-actions present (if committed)
  let non_actions_present = true;
  if (artifact.commitment_gate.commitment_made && artifact.action_plan) {
    non_actions_present =
      artifact.action_plan.explicit_non_actions && artifact.action_plan.explicit_non_actions.length > 0;
    if (!non_actions_present) {
      errors.push("DOCTRINE VIOLATION: explicit_non_actions required when committed to a path.");
    }
  }

  // 4. DOCTRINE CHECK: Forbidden language absent
  const textToCheck = [
    ...artifact.decision_paths.map((p) => p.path_name),
    ...artifact.decision_paths.flatMap((p) => p.trade_offs),
    artifact.primary_constraint.constraint_description,
    ...artifact.structural_findings.map((f) => f.finding_summary),
  ].join(" ");

  const languageViolations = checkForbiddenLanguage(textToCheck);
  const forbidden_language_absent = languageViolations.length === 0;
  if (!forbidden_language_absent) {
    errors.push(...languageViolations.map((v) => `DOCTRINE VIOLATION: ${v}`));
  }

  // 5. DOCTRINE CHECK: Commitment gate valid
  const commitment_gate_valid =
    artifact.commitment_gate.owner_choice === "path_A" ||
    artifact.commitment_gate.owner_choice === "path_B" ||
    (artifact.commitment_gate.owner_choice === "neither" && !artifact.action_plan);
  if (!commitment_gate_valid) {
    errors.push("DOCTRINE VIOLATION: Invalid commitment gate state.");
  }

  // 6. DOCTRINE CHECK: Conclusions locked unless triggered
  // (This check requires prior run data; for now, just validate structure)
  const conclusions_locked_unless_triggered = true; // Placeholder for now
  // TODO: Implement cross-run lock checking when prior conclusions exist

  // 7. DOCTRINE CHECK: If owner declined, artifact should end cleanly (no action plan)
  if (artifact.commitment_gate.owner_choice === "neither" && artifact.action_plan) {
    errors.push("DOCTRINE VIOLATION: Owner declined commitment but action plan present. Should end cleanly.");
  }

  // Build doctrine checks
  const all_checks_passed =
    max_two_paths_enforced &&
    non_actions_present &&
    forbidden_language_absent &&
    commitment_gate_valid &&
    conclusions_locked_unless_triggered;

  const failed_checks: string[] = [];
  if (!max_two_paths_enforced) failed_checks.push("max_two_paths");
  if (!non_actions_present) failed_checks.push("non_actions_required");
  if (!forbidden_language_absent) failed_checks.push("forbidden_language_detected");
  if (!commitment_gate_valid) failed_checks.push("commitment_gate_invalid");
  if (!conclusions_locked_unless_triggered) failed_checks.push("conclusions_not_locked");

  const doctrine_checks: DoctrineChecks = {
    checks_version: "doctrine_v1",
    max_two_paths_enforced,
    non_actions_present,
    forbidden_language_absent,
    commitment_gate_valid,
    conclusions_locked_unless_triggered,
    all_checks_passed,
    failed_checks,
  };

  const checksValidation = doctrineChecksSchema.safeParse(doctrine_checks);
  if (!checksValidation.success) {
    errors.push(`Doctrine checks schema invalid: ${checksValidation.error.message}`);
  }

  // Strict mode: throw on violations
  if (args.strict && !all_checks_passed) {
    throw new Error(`DOCTRINE VIOLATIONS:\n${errors.join("\n")}`);
  }

  return {
    valid: all_checks_passed,
    doctrine_checks,
    errors,
  };
}
