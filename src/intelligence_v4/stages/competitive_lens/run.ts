import type { CompetitiveLensStageContext } from "../../pipeline/context_builder";
import {
  type CompetitiveLensV1,
  getStageSchema,
  validateStageArtifact,
} from "../../pipeline/contracts";
import { PipelineStageError } from "../../pipeline/errors";
import { runDoctrineGuards } from "../../pipeline/guards";
import type { StageModelConfig } from "../../pipeline/model_registry";
import { runStageModel } from "../../pipeline/model_runner";
import { loadStagePrompt } from "../../pipeline/prompt_loader";

type CompetitiveStageParams = {
  context: CompetitiveLensStageContext;
  model: StageModelConfig;
};

function buildDeterministicCompetitiveLens(params: {
  model_id: string;
  prompt_version: string;
  context: CompetitiveLensStageContext;
}): CompetitiveLensV1 {
  const quant = params.context.quant_signals;
  const ownerLoad = params.context.owner_load;
  const evidenceRefs = [...new Set([...quant.evidence_refs, ...ownerLoad.evidence_refs])].slice(0, 14);

  return {
    schema_version: "competitive_lens_v1",
    stage_name: "competitive_lens",
    model_id: params.model_id,
    prompt_version: params.prompt_version,
    confidence: quant.confidence,
    evidence_refs: evidenceRefs,
    data_limits: quant.data_limits,
    market_pressures: [
      {
        id: "response_window_pressure",
        pressure: "Local buyers expect quick commitment clarity and switch providers when responses stall.",
        confidence: "medium",
        evidence_refs: evidenceRefs.slice(0, 2),
      },
      {
        id: "reliability_pressure",
        pressure: "Reliability becomes a differentiator when schedules slide or updates are inconsistent.",
        confidence: "medium",
        evidence_refs: evidenceRefs.slice(1, 3),
      },
      {
        id: "trust_signal_pressure",
        pressure: "Trust compounds through consistent follow-through, not broad service promises.",
        confidence: "low",
        evidence_refs: evidenceRefs.slice(0, 1),
      },
    ],
    strengths: [
      `${params.context.business_name} already has real demand signals in recent operating data.`,
      "Delivery knowledge is close to the work and can be codified into repeatable handoffs.",
      "Owner pattern awareness enables faster correction once one direction is chosen.",
    ],
    vulnerabilities: [
      "Decision and scheduling handoffs remain too dependent on owner interrupts.",
      "High-volatility periods compress response quality and create promise risk.",
      "Competing urgency channels make customer communication sequence inconsistent.",
    ],
    collapsed_view:
      "Competition is won by dependable execution cadence; fragmented handoffs make that cadence harder to sustain.",
  };
}

export async function runCompetitiveLensStage(params: CompetitiveStageParams): Promise<CompetitiveLensV1> {
  const { prompt, prompt_version } = loadStagePrompt("competitive_lens");
  const schema = getStageSchema("competitive_lens");

  const artifact = await runStageModel<CompetitiveLensV1>({
    stage_name: "competitive_lens",
    model: params.model,
    schema,
    prompt,
    input: {
      industry: params.context.industry,
      quant_signals: params.context.quant_signals,
      owner_load: params.context.owner_load,
    },
    deterministic: () =>
      buildDeterministicCompetitiveLens({
        model_id: params.model.model_id,
        prompt_version,
        context: params.context,
      }),
  });

  const validation = validateStageArtifact("competitive_lens", artifact);
  if (!validation.ok) {
    throw new PipelineStageError({
      code: "SCHEMA_VALIDATION_FAILED",
      stage_name: "competitive_lens",
      reason: "Competitive stage output failed schema validation.",
      validation_errors: validation.errors,
      next_action: "Fix competitive_lens output to match competitive_lens_v1.",
    });
  }

  const guards = runDoctrineGuards("competitive_lens", artifact);
  if (!guards.passed) {
    throw new PipelineStageError({
      code: "DOCTRINE_GUARD_FAILED",
      stage_name: "competitive_lens",
      reason: "Competitive stage output failed doctrine guards.",
      guard_failures: guards.failures.map((failure) => failure.message),
      next_action: "Remove drift language and keep competitive lens collapsed.",
    });
  }

  return artifact;
}