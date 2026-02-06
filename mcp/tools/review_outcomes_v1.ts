/**
 * SYSTEM 5: Monthly Outcome Validation Tool
 * 
 * Compares expected signals vs actual signals.
 * Classifies: implemented vs not implemented, working vs not working.
 */

import {
  outcomeReviewSchema,
  type OutcomeReview,
  type CommitmentPlan,
  type AccountabilitySpec,
} from "../../schemas/decision_closure";
import type { ComputedSignals } from "./compute_signals_v2";

export const tool = {
  name: "outcomes.review_v1",
  description: "Monthly outcome validation: compare expected vs actual signals, assess implementation and strategy.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["commitment_plan", "accountability_spec", "current_signals", "previous_signals"],
    properties: {
      commitment_plan: {
        type: "object",
        description: "The original commitment plan",
      },
      accountability_spec: {
        type: "object",
        description: "The original accountability spec",
      },
      current_signals: {
        type: "object",
        description: "Current month computed signals",
      },
      previous_signals: {
        type: "object",
        description: "Previous month computed signals (for comparison)",
      },
      actions_completed: {
        type: "array",
        items: { type: "string" },
        description: "Actions marked as completed by owner",
      },
    },
  },
} as const;

export type ReviewOutcomesV1Args = {
  commitment_plan: CommitmentPlan;
  accountability_spec: AccountabilitySpec;
  current_signals: ComputedSignals;
  previous_signals: ComputedSignals;
  actions_completed?: string[];
};

export async function handler(args: ReviewOutcomesV1Args): Promise<OutcomeReview> {
  const { commitment_plan, accountability_spec, current_signals, previous_signals, actions_completed = [] } = args;

  const now = new Date();
  const commitmentDate = new Date(commitment_plan.created_at);
  const daysSinceCommitment = Math.floor((now.getTime() - commitmentDate.getTime()) / (1000 * 60 * 60 * 24));

  // Assess implementation status
  const totalActions = commitment_plan.minimal_actions.length;
  const completedActions = actions_completed.length;
  const implementationPct = (completedActions / totalActions) * 100;

  let implementation_status: "fully_implemented" | "partially_implemented" | "not_implemented" | "blocked";
  if (implementationPct >= 90) {
    implementation_status = "fully_implemented";
  } else if (implementationPct >= 50) {
    implementation_status = "partially_implemented";
  } else if (implementationPct > 0) {
    implementation_status = "partially_implemented";
  } else if (daysSinceCommitment > 30) {
    implementation_status = "blocked";
  } else {
    implementation_status = "not_implemented";
  }

  // Compare signals vs success metrics
  const expected_signals_comparison = accountability_spec.success_metrics.map((metric) => {
    let actual = "Not yet measured";
    let met = false;

    // Check volatility change
    if (metric.metric.toLowerCase().includes("volatility")) {
      const prevVolatility = previous_signals.volatility_band;
      const currVolatility = current_signals.volatility_band;
      actual = `Volatility: ${prevVolatility} → ${currVolatility}`;
      met = currVolatility < prevVolatility; // Assuming lower is better
    }

    // Check seasonality
    if (metric.metric.toLowerCase().includes("season")) {
      actual = `Seasonality: ${current_signals.seasonality_pattern}`;
      met = current_signals.seasonality_pattern !== "strong"; // Depends on goal
    }

    // Check approval lag
    if (metric.metric.toLowerCase().includes("approval") || metric.metric.toLowerCase().includes("decision")) {
      actual = current_signals.approval_lag_signal;
      met = !current_signals.approval_lag_signal.includes("High");
    }

    // Check owner dependency
    if (metric.metric.toLowerCase().includes("owner") || metric.metric.toLowerCase().includes("bottleneck")) {
      const hasBottleneck = current_signals.owner_dependency.some((d) => d.dependency_type === "approval_bottleneck");
      actual = hasBottleneck ? "Owner bottleneck still present" : "Owner bottleneck reduced";
      met = !hasBottleneck;
    }

    return {
      signal: metric.metric,
      expected: metric.target,
      actual,
      met,
    };
  });

  const signalsMet = expected_signals_comparison.filter((s) => s.met).length;
  const signalsMetPct = (signalsMet / expected_signals_comparison.length) * 100;

  // Assess strategy effectiveness
  let strategy_assessment: "working_as_expected" | "working_partially" | "not_working" | "too_early_to_tell";
  if (daysSinceCommitment < 30) {
    strategy_assessment = "too_early_to_tell";
  } else if (implementation_status === "fully_implemented") {
    if (signalsMetPct >= 70) {
      strategy_assessment = "working_as_expected";
    } else if (signalsMetPct >= 40) {
      strategy_assessment = "working_partially";
    } else {
      strategy_assessment = "not_working";
    }
  } else if (implementation_status === "partially_implemented") {
    if (signalsMetPct >= 50) {
      strategy_assessment = "working_partially";
    } else {
      strategy_assessment = "too_early_to_tell";
    }
  } else {
    strategy_assessment = "too_early_to_tell";
  }

  // Pressure change assessment
  let pressure_change: "reduced" | "unchanged" | "increased";
  if (signalsMet > 0 && implementation_status === "fully_implemented") {
    pressure_change = "reduced";
  } else if (signalsMet === 0 && daysSinceCommitment > 60) {
    pressure_change = "increased";
  } else {
    pressure_change = "unchanged";
  }

  // Pivot recommendation
  let pivot_recommendation: "continue" | "adjust" | "pivot" | "end";
  if (strategy_assessment === "working_as_expected") {
    pivot_recommendation = "continue";
  } else if (strategy_assessment === "working_partially" && implementation_status === "fully_implemented") {
    pivot_recommendation = "adjust";
  } else if (strategy_assessment === "not_working" && implementation_status === "fully_implemented") {
    pivot_recommendation = "pivot";
  } else if (implementation_status === "blocked" && daysSinceCommitment > 60) {
    pivot_recommendation = "end";
  } else {
    pivot_recommendation = "continue";
  }

  // Reasoning
  let reasoning = "";
  if (strategy_assessment === "too_early_to_tell") {
    reasoning = `Only ${daysSinceCommitment} days since commitment. Need more time to assess.`;
  } else if (implementation_status !== "fully_implemented") {
    reasoning = `Implementation is ${implementation_status} (${completedActions}/${totalActions} actions). Strategy cannot be fairly assessed until fully implemented.`;
  } else {
    reasoning = `${signalsMet}/${expected_signals_comparison.length} success metrics met. ${
      pressure_change === "reduced" ? "Pressure is reducing." : "Pressure remains."
    }`;
  }

  const review: OutcomeReview = {
    review_version: "outcome_v1",
    review_date: now.toISOString(),
    days_since_commitment: daysSinceCommitment,
    implementation_status,
    strategy_assessment,
    expected_signals_comparison,
    pressure_change,
    pivot_recommendation,
    reasoning,
  };

  const validationResult = outcomeReviewSchema.safeParse(review);
  if (!validationResult.success) {
    throw new Error(`Invalid outcome review: ${validationResult.error.message}`);
  }

  return review;
}
