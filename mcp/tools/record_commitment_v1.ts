/**
 * SYSTEM 4: Commitment Recording Tool
 * 
 * Records owner's path selection and generates action plan + accountability spec.
 * DOCTRINE: Explicit non-actions required.
 */

import {
  commitmentGateSchema,
  commitmentPlanSchema,
  accountabilitySpecSchema,
  type CommitmentGate,
  type CommitmentPlan,
  type AccountabilitySpec,
  type DecisionPath,
} from "../../schemas/decision_closure";

export const tool = {
  name: "commitment.record_v1",
  description: "Record commitment to a decision path and generate action plan + accountability spec.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["owner_choice", "chosen_path_details"],
    properties: {
      owner_choice: {
        type: "string",
        enum: ["path_A", "path_B", "neither"],
      },
      chosen_path_details: {
        type: "object",
        description: "The selected DecisionPath object (A or B)",
      },
      time_box_days: {
        type: "number",
        minimum: 30,
        maximum: 180,
        description: "Time box for implementation (30-180 days)",
      },
      minimal_actions: {
        type: "array",
        items: {
          type: "object",
          required: ["action", "deadline_days", "responsible"],
          properties: {
            action: { type: "string" },
            deadline_days: { type: "number" },
            responsible: { type: "string", enum: ["owner", "team", "external"] },
          },
        },
        minItems: 1,
        maxItems: 5,
      },
      explicit_non_actions: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
        description: "DOCTRINE REQUIRED: What we are NOT doing",
      },
    },
  },
} as const;

export type RecordCommitmentV1Args = {
  owner_choice: "path_A" | "path_B" | "neither";
  chosen_path_details?: Partial<DecisionPath>;
  time_box_days?: number;
  minimal_actions?: Array<{
    action: string;
    deadline_days: number;
    responsible: "owner" | "team" | "external";
  }>;
  explicit_non_actions?: string[];
};

export async function handler(args: RecordCommitmentV1Args): Promise<{
  commitment_gate: CommitmentGate;
  action_plan?: CommitmentPlan;
  accountability?: AccountabilitySpec;
  end_cleanly: boolean;
}> {
  const now = new Date().toISOString();

  // Build commitment gate
  const commitmentGate: CommitmentGate = {
    owner_choice: args.owner_choice,
    commitment_made: args.owner_choice !== "neither",
    chosen_at: args.owner_choice !== "neither" ? now : undefined,
    reason_if_declined: args.owner_choice === "neither" ? "Owner declined to commit" : undefined,
  };

  const validationResult = commitmentGateSchema.safeParse(commitmentGate);
  if (!validationResult.success) {
    throw new Error(`Invalid commitment gate: ${validationResult.error.message}`);
  }

  // DOCTRINE: End cleanly if owner won't commit
  if (args.owner_choice === "neither") {
    return {
      commitment_gate: commitmentGate,
      end_cleanly: true,
    };
  }

  // Build action plan (if committed)
  if (!args.minimal_actions || args.minimal_actions.length === 0) {
    throw new Error("minimal_actions required when committing to a path");
  }

  if (!args.explicit_non_actions || args.explicit_non_actions.length === 0) {
    throw new Error("DOCTRINE VIOLATION: explicit_non_actions required (what we are NOT doing)");
  }

  const chosenPath = args.owner_choice === "path_A" ? "A" : "B";
  const actionPlan: CommitmentPlan = {
    plan_version: "commitment_v1",
    chosen_path: chosenPath,
    time_box_days: args.time_box_days ?? 90,
    minimal_actions: args.minimal_actions,
    explicit_non_actions: args.explicit_non_actions,
    created_at: now,
  };

  const planValidation = commitmentPlanSchema.safeParse(actionPlan);
  if (!planValidation.success) {
    throw new Error(`Invalid commitment plan: ${planValidation.error.message}`);
  }

  // Build accountability spec
  const chosenPathDetails = args.chosen_path_details;
  const reEvaluationTriggers = chosenPathDetails?.proof_of_concept_signals?.map((poc) => ({
    trigger: poc.signal,
    check_frequency_days: Math.min(poc.time_window_days, 30),
    trigger_fired: false,
  })) ?? [
    {
      trigger: "Monthly review of expected signals",
      check_frequency_days: 30,
      trigger_fired: false,
    },
  ];

  const failureConditions = chosenPathDetails?.exit_conditions ?? [
    "No measurable progress after 30 days",
    "Owner unable to execute minimal actions",
    "Pressure increases instead of decreasing",
  ];

  const successMetrics = chosenPathDetails?.proof_of_concept_signals?.map((poc) => ({
    metric: poc.signal,
    target: poc.expected_outcome,
  })) ?? [
    {
      metric: "Pressure reduction",
      target: "Measurable decrease in primary constraint",
    },
  ];

  const accountability: AccountabilitySpec = {
    spec_version: "accountability_v1",
    re_evaluation_triggers: reEvaluationTriggers.slice(0, 3),
    failure_conditions: failureConditions.slice(0, 3),
    success_metrics: successMetrics.slice(0, 3),
    created_at: now,
  };

  const accountabilityValidation = accountabilitySpecSchema.safeParse(accountability);
  if (!accountabilityValidation.success) {
    throw new Error(`Invalid accountability spec: ${accountabilityValidation.error.message}`);
  }

  return {
    commitment_gate: commitmentGate,
    action_plan: actionPlan,
    accountability,
    end_cleanly: false,
  };
}
