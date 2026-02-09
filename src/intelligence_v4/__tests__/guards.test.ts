import { describe, expect, it } from "vitest";

import type { DecisionArtifactV1 } from "../pipeline/contracts";
import { runDoctrineGuards } from "../pipeline/guards";

function makeDecisionArtifact(): DecisionArtifactV1 {
  return {
    schema_version: "decision_artifact_v1",
    stage_name: "synthesis_decision",
    model_id: "deterministic:test",
    prompt_version: "v1",
    confidence: "medium",
    evidence_refs: ["bucket:decision_latency:high"],
    data_limits: {
      window_mode: "last_90_days",
      row_limit_applied: 90,
      saw_quotes: true,
      saw_invoices: true,
      saw_jobs: false,
      saw_customers: false,
      notes: ["test"],
    },
    primary_constraint: "Owner handoffs are overloaded.",
    why_it_feels_heavy: "Pressure is structural and interruptions keep decisions open.",
    paths: {
      A: {
        title: "A",
        who_it_fits: "Fit A context",
        tradeoffs: ["t1", "t2"],
        first_steps: ["s1", "s2", "s3"],
        risks: ["r1", "r2"],
        guardrails: ["g1", "g2"],
      },
      B: {
        title: "B",
        who_it_fits: "Fit B context",
        tradeoffs: ["t1", "t2"],
        first_steps: ["s1", "s2", "s3"],
        risks: ["r1", "r2"],
        guardrails: ["g1", "g2"],
      },
      C: {
        title: "C",
        who_it_fits: "Fit C context",
        tradeoffs: ["t1", "t2"],
        first_steps: ["s1", "s2", "s3"],
        risks: ["r1", "r2"],
        guardrails: ["g1", "g2"],
      },
    },
    recommended_path: "A",
    first_30_days: ["a1", "a2", "a3", "a4", "a5"],
    owner_choice_prompt: "Choose A, B, or C.",
    language_checks: {
      forbidden_terms_found: [],
      passed: true,
    },
  };
}

describe("intelligence_v4 doctrine guards", () => {
  it("fails on forbidden vocabulary", () => {
    const artifact = makeDecisionArtifact();
    artifact.primary_constraint = "Set up a dashboard for this.";

    const result = runDoctrineGuards("synthesis_decision", artifact);
    expect(result.passed).toBe(false);
    expect(result.failures.some((failure) => failure.message.toLowerCase().includes("forbidden"))).toBe(true);
  });

  it("fails when action count exceeds policy", () => {
    const artifact = makeDecisionArtifact();
    artifact.first_30_days = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

    const result = runDoctrineGuards("synthesis_decision", artifact);
    expect(result.passed).toBe(false);
    expect(result.failures.some((failure) => failure.code === "decision_action_count_invalid")).toBe(true);
  });
});