import type { BlueOceanStageContext } from "../../pipeline/context_builder";
import {
  type BlueOceanV1,
  getStageSchema,
  validateStageArtifact,
} from "../../pipeline/contracts";
import { PipelineStageError } from "../../pipeline/errors";
import { runDoctrineGuards } from "../../pipeline/guards";
import type { StageModelConfig } from "../../pipeline/model_registry";
import { runStageModel } from "../../pipeline/model_runner";
import { loadStagePrompt } from "../../pipeline/prompt_loader";

type BlueOceanStageParams = {
  context: BlueOceanStageContext;
  model: StageModelConfig;
};

function buildDeterministicBlueOcean(params: {
  model_id: string;
  prompt_version: string;
  context: BlueOceanStageContext;
}): BlueOceanV1 {
  const quant = params.context.quant_signals;
  const ownerLoad = params.context.owner_load;
  const competitive = params.context.competitive;
  const evidenceRefs = [...new Set([...quant.evidence_refs, ...ownerLoad.evidence_refs, ...competitive.evidence_refs])].slice(
    0,
    16
  );

  return {
    schema_version: "blue_ocean_v1",
    stage_name: "blue_ocean",
    model_id: params.model_id,
    prompt_version: params.prompt_version,
    confidence: quant.confidence,
    evidence_refs: evidenceRefs,
    data_limits: quant.data_limits,
    capacity_guardrail_statement:
      "Any strategic move must reduce owner interrupts before adding new commitments.",
    asymmetric_moves: [
      {
        id: "promise_window_design",
        move: "Offer two reliability promise windows instead of open-ended timelines.",
        why_now: "It narrows decision churn and sets clearer customer expectations.",
        capacity_check: "Capacity fit: only launch if daily exception count stays below owner escalation threshold.",
        confidence: "medium",
        evidence_refs: evidenceRefs.slice(0, 2),
      },
      {
        id: "handoff_standard",
        move: "Package every job handoff with one standard pre-dispatch brief.",
        why_now: "It lowers repeated clarifications and protects execution consistency.",
        capacity_check: "Load fit: keep owner handoff prep under 45 minutes per day.",
        confidence: "medium",
        evidence_refs: evidenceRefs.slice(1, 3),
      },
      {
        id: "scope_boundary_offer",
        move: "Narrow offerings to high-clarity work where delivery reliability is strongest.",
        why_now: "Focused offers reduce firefighting and improve follow-through.",
        capacity_check: "Capacity fit: hold weekly committed jobs within current crew completion range.",
        confidence: "low",
        evidence_refs: evidenceRefs.slice(2, 4),
      },
    ],
    rejected_load_increasing_moves: [
      "Adding new service lines before handoff reliability is stable.",
      "Expanding territory while owner interruptions remain high.",
      "Launching campaigns that require daily owner response triage.",
    ],
  };
}

export async function runBlueOceanStage(params: BlueOceanStageParams): Promise<BlueOceanV1> {
  const { prompt, prompt_version } = loadStagePrompt("blue_ocean");
  const schema = getStageSchema("blue_ocean");

  const artifact = await runStageModel<BlueOceanV1>({
    stage_name: "blue_ocean",
    model: params.model,
    schema,
    prompt,
    input: {
      quant_signals: params.context.quant_signals,
      owner_load: params.context.owner_load,
      competitive_lens: params.context.competitive,
    },
    deterministic: () =>
      buildDeterministicBlueOcean({
        model_id: params.model.model_id,
        prompt_version,
        context: params.context,
      }),
  });

  const validation = validateStageArtifact("blue_ocean", artifact);
  if (!validation.ok) {
    throw new PipelineStageError({
      code: "SCHEMA_VALIDATION_FAILED",
      stage_name: "blue_ocean",
      reason: "Blue Ocean stage output failed schema validation.",
      validation_errors: validation.errors,
      next_action: "Fix blue_ocean output to match blue_ocean_v1.",
    });
  }

  const guards = runDoctrineGuards("blue_ocean", artifact);
  if (!guards.passed) {
    throw new PipelineStageError({
      code: "DOCTRINE_GUARD_FAILED",
      stage_name: "blue_ocean",
      reason: "Blue Ocean stage output failed doctrine guards.",
      guard_failures: guards.failures.map((failure) => failure.message),
      next_action: "Remove load-increasing moves and restate capacity checks.",
    });
  }

  return artifact;
}