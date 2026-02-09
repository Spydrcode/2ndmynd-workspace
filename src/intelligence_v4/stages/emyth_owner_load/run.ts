import type { OwnerLoadStageContext } from "../../pipeline/context_builder";
import {
  type OwnerLoadV1,
  getStageSchema,
  validateStageArtifact,
} from "../../pipeline/contracts";
import { PipelineStageError } from "../../pipeline/errors";
import { runDoctrineGuards } from "../../pipeline/guards";
import type { StageModelConfig } from "../../pipeline/model_registry";
import { runStageModel } from "../../pipeline/model_runner";
import { loadStagePrompt } from "../../pipeline/prompt_loader";

type OwnerLoadStageParams = {
  context: OwnerLoadStageContext;
  model: StageModelConfig;
};

function buildDeterministicOwnerLoad(params: {
  model_id: string;
  prompt_version: string;
  context: OwnerLoadStageContext;
}): OwnerLoadV1 {
  const quant = params.context.quant_signals;
  const topSignals = quant.signals.slice(0, 3);
  const evidenceRefs = [...new Set(topSignals.flatMap((signal) => signal.evidence_refs))].slice(0, 10);
  const lagSignal = quant.signals.find((signal) => signal.id === "decision_latency");
  const capacitySignal = quant.signals.find((signal) => signal.id === "capacity_squeeze_proxy");

  const bottleneck = lagSignal?.value_bucket === "high"
    ? "Decision flow is stalled between quote acceptance and execution handoff."
    : capacitySignal?.value_bucket === "high"
      ? "Daily coordination load is absorbing owner attention before completion work starts."
      : "Owner attention is fragmented across too many operating handoffs.";

  const heavyReason =
    "Pressure is structural: competing commitments force the owner to context-switch between promises, scheduling, and issue triage.";

  return {
    schema_version: "owner_load_v1",
    stage_name: "emyth_owner_load",
    model_id: params.model_id,
    prompt_version: params.prompt_version,
    confidence: quant.confidence,
    evidence_refs: evidenceRefs,
    data_limits: quant.data_limits,
    bottleneck_diagnosis: bottleneck,
    why_it_feels_heavy: heavyReason,
    owner_load_drivers: [
      {
        id: "handoff_interruptions",
        summary: "Handoffs are owner-dependent, so unresolved decisions return to the owner queue.",
        confidence: "medium",
        evidence_refs: evidenceRefs.slice(0, 2),
      },
      {
        id: "sequence_instability",
        summary: "Work sequencing shifts through the week, forcing reactive reprioritization.",
        confidence: "medium",
        evidence_refs: evidenceRefs.slice(1, 3),
      },
      {
        id: "role_overload",
        summary: `${params.context.business_name} is operating with a ${params.context.emyth_role} role split, increasing context-switching cost.`,
        confidence: "low",
        evidence_refs: evidenceRefs.slice(0, 1),
      },
    ],
    relief_without_expansion: [
      "Freeze one daily owner decision window and batch all non-urgent escalations into it.",
      "Define one handoff checklist so team decisions land complete before reaching owner review.",
      "Set a same-day escalation threshold to separate urgent exceptions from routine noise.",
    ],
    prohibitions_checked: {
      no_tools_prescribed: true,
      no_hiring_prescribed: true,
      no_scaling_prescribed: true,
    },
  };
}

export async function runEmythOwnerLoadStage(params: OwnerLoadStageParams): Promise<OwnerLoadV1> {
  const { prompt, prompt_version } = loadStagePrompt("emyth_owner_load");
  const schema = getStageSchema("emyth_owner_load");

  const artifact = await runStageModel<OwnerLoadV1>({
    stage_name: "emyth_owner_load",
    model: params.model,
    schema,
    prompt,
    input: {
      industry: params.context.industry,
      emyth_role: params.context.emyth_role,
      quant_signals: params.context.quant_signals,
    },
    deterministic: () =>
      buildDeterministicOwnerLoad({
        model_id: params.model.model_id,
        prompt_version,
        context: params.context,
      }),
  });

  const validation = validateStageArtifact("emyth_owner_load", artifact);
  if (!validation.ok) {
    throw new PipelineStageError({
      code: "SCHEMA_VALIDATION_FAILED",
      stage_name: "emyth_owner_load",
      reason: "Owner-load stage output failed schema validation.",
      validation_errors: validation.errors,
      next_action: "Fix emyth_owner_load output to match owner_load_v1.",
    });
  }

  const guards = runDoctrineGuards("emyth_owner_load", artifact);
  if (!guards.passed) {
    throw new PipelineStageError({
      code: "DOCTRINE_GUARD_FAILED",
      stage_name: "emyth_owner_load",
      reason: "Owner-load stage output failed doctrine guards.",
      guard_failures: guards.failures.map((failure) => failure.message),
      next_action: "Remove tool/hiring/scaling prescriptions and rerun.",
    });
  }

  return artifact;
}