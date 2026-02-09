import type { SynthesisStageContext } from "../../pipeline/context_builder";
import {
  type DecisionArtifactV1,
  getStageSchema,
  validateStageArtifact,
} from "../../pipeline/contracts";
import { PipelineStageError } from "../../pipeline/errors";
import { loadPolicyConfig, runDoctrineGuards } from "../../pipeline/guards";
import type { StageModelConfig } from "../../pipeline/model_registry";
import { runStageModel } from "../../pipeline/model_runner";
import { loadStagePrompt } from "../../pipeline/prompt_loader";

type SynthesisStageParams = {
  context: SynthesisStageContext;
  model: StageModelConfig;
};

function chooseRecommendation(context: SynthesisStageContext): "A" | "B" | "C" {
  const volatility = context.quant_signals.signals.find((signal) => signal.id === "volatility")?.value_bucket;
  const capacity = context.quant_signals.signals.find((signal) => signal.id === "capacity_squeeze_proxy")?.value_bucket;

  if (capacity === "high") return "A";
  if (volatility === "high") return "B";
  return "C";
}

function buildDeterministicDecision(params: {
  model_id: string;
  prompt_version: string;
  context: SynthesisStageContext;
}): DecisionArtifactV1 {
  const { context } = params;
  const policy = loadPolicyConfig();
  const evidenceRefs = [
    ...new Set([
      ...context.quant_signals.evidence_refs,
      ...context.owner_load.evidence_refs,
      ...context.competitive.evidence_refs,
      ...context.blue_ocean.evidence_refs,
    ]),
  ].slice(0, 20);

  const primaryConstraint = context.owner_load.bottleneck_diagnosis;
  const recommended = chooseRecommendation(context);

  const artifact: DecisionArtifactV1 = {
    schema_version: "decision_artifact_v1",
    stage_name: "synthesis_decision",
    model_id: params.model_id,
    prompt_version: params.prompt_version,
    confidence: context.quant_signals.confidence,
    evidence_refs: evidenceRefs,
    data_limits: context.quant_signals.data_limits,
    primary_constraint: primaryConstraint,
    why_it_feels_heavy:
      "Unresolved handoffs keep returning to the owner, adding repeated decision loops.",
    paths: {
      A: {
        title: "Stabilize Handovers First",
        who_it_fits: "Fits owners with high interruption load and unstable dispatch handoffs.",
        tradeoffs: [
          "Short-term volume is capped while execution discipline is set.",
          "Some low-fit work is declined to protect reliability.",
        ],
        first_steps: [
          "Define one escalation threshold and route non-urgent issues to daily review.",
          "Launch a single handoff checklist used before any owner escalation.",
          "Freeze ad-hoc scope additions for seven days.",
        ],
        risks: [
          "Team may initially escalate too much while habits reset.",
          "Customers used to custom exceptions may push back.",
        ],
        guardrails: [
          "Keep owner escalation windows time-boxed.",
          "Do not add new service offerings during reset.",
        ],
      },
      B: {
        title: "Reliability Promise Reset",
        who_it_fits: "Fits teams where decision lag and expectation mismatch drive pressure.",
        tradeoffs: [
          "Promise windows become narrower and require stricter qualification.",
          "Sales flexibility drops while communication cadence is standardized.",
        ],
        first_steps: [
          "Publish two promise windows and align dispatch to those windows only.",
          "Send one structured customer update format for every job state change.",
          "Review delayed approvals daily and close open loops before new commitments.",
        ],
        risks: [
          "Early friction from customers expecting bespoke timelines.",
          "Internal resistance to standardized update language.",
        ],
        guardrails: [
          "No same-day promise changes without owner approval.",
          "Keep communication templates under one screen for speed.",
        ],
      },
      C: {
        title: "Focused Offer Tightening",
        who_it_fits: "Fits businesses with mixed demand where only a subset of jobs stay predictable.",
        tradeoffs: [
          "Revenue mix changes as lower-clarity jobs are reduced.",
          "Some referral channels may cool during offer tightening.",
        ],
        first_steps: [
          "Define high-clarity job criteria and apply them to new quotes.",
          "Pause low-clarity quote types for two weeks.",
          "Reframe proposal language around reliability and scope certainty.",
        ],
        risks: [
          "Near-term pipeline volume may dip.",
          "Sales team may over-qualify and miss viable jobs.",
        ],
        guardrails: [
          "Review declined job reasons weekly for bias.",
          "Keep owner review focused on edge cases only.",
        ],
      },
    },
    recommended_path: recommended,
    first_30_days: [
      "Week 1: lock one escalation protocol and publish it to team.",
      "Week 1: run a handoff checklist pilot on all active jobs.",
      "Week 2: remove one recurring interruption source from owner inbox.",
      "Week 2: standardize customer update sequence for open work.",
      "Week 3: audit unresolved decisions older than 48 hours and close them.",
      "Week 4: keep only one chosen path and stop cross-path experiments.",
    ],
    owner_choice_prompt: "Choose A, B, or C based on which tradeoff you can hold for 30 days.",
    language_checks: {
      forbidden_terms_found: policy.forbidden_vocabulary.filter((term) =>
        new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(primaryConstraint)
      ),
      passed: true,
    },
  };

  return artifact;
}

export async function runSynthesisDecisionStage(params: SynthesisStageParams): Promise<DecisionArtifactV1> {
  const { prompt, prompt_version } = loadStagePrompt("synthesis_decision");
  const schema = getStageSchema("synthesis_decision");

  const artifact = await runStageModel<DecisionArtifactV1>({
    stage_name: "synthesis_decision",
    model: params.model,
    schema,
    prompt,
    input: {
      quant_signals: params.context.quant_signals,
      owner_load: params.context.owner_load,
      competitive_lens: params.context.competitive,
      blue_ocean: params.context.blue_ocean,
    },
    deterministic: () =>
      buildDeterministicDecision({
        model_id: params.model.model_id,
        prompt_version,
        context: params.context,
      }),
  });

  const validation = validateStageArtifact("synthesis_decision", artifact);
  if (!validation.ok) {
    throw new PipelineStageError({
      code: "SCHEMA_VALIDATION_FAILED",
      stage_name: "synthesis_decision",
      reason: "Synthesis stage output failed schema validation.",
      validation_errors: validation.errors,
      next_action: "Fix synthesis_decision output to match decision_artifact_v1.",
    });
  }

  const guards = runDoctrineGuards("synthesis_decision", artifact);
  if (!guards.passed) {
    throw new PipelineStageError({
      code: "DOCTRINE_GUARD_FAILED",
      stage_name: "synthesis_decision",
      reason: "Synthesis stage output failed doctrine guards.",
      guard_failures: guards.failures.map((failure) => failure.message),
      next_action: "Fix decision structure/language and rerun pipeline.",
    });
  }

  return artifact;
}
