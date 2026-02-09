import { STAGE_ORDER, type StageArtifactMap, type StageName } from "./contracts";
import type {
  BlueOceanStageContext,
  CompetitiveLensStageContext,
  OwnerLoadStageContext,
  QuantStageContext,
  SynthesisStageContext,
} from "./context_builder";
import type { StageModelConfig } from "./model_registry";
import { runBlueOceanStage } from "../stages/blue_ocean/run";
import { runCompetitiveLensStage } from "../stages/competitive_lens/run";
import { runEmythOwnerLoadStage } from "../stages/emyth_owner_load/run";
import { runQuantSignalsStage } from "../stages/quant_signals/run";
import { runSynthesisDecisionStage } from "../stages/synthesis_decision/run";

export type StageMetadata = {
  stage_name: StageName;
  title: string;
  purpose: string;
};

export const stageRegistry: StageMetadata[] = [
  {
    stage_name: "quant_signals",
    title: "Quant Signals Engine",
    purpose: "Produce bucketed signals and evidence references only.",
  },
  {
    stage_name: "emyth_owner_load",
    title: "E-Myth Owner Load Interpreter",
    purpose: "Describe structural owner load without tool or hiring prescriptions.",
  },
  {
    stage_name: "competitive_lens",
    title: "Competitive Lens",
    purpose: "Summarize market pressure, strengths, and vulnerabilities.",
  },
  {
    stage_name: "blue_ocean",
    title: "Blue Ocean Shaper",
    purpose: "Shape asymmetric moves that do not increase owner load.",
  },
  {
    stage_name: "synthesis_decision",
    title: "Synthesis Decision Engine",
    purpose: "Return one finite decision artifact with exactly three paths.",
  },
];

export function getOrderedStages(): StageName[] {
  return [...STAGE_ORDER];
}

export async function runStage(params: {
  stage_name: "quant_signals";
  context: QuantStageContext;
  model: StageModelConfig;
}): Promise<StageArtifactMap["quant_signals"]>;
export async function runStage(params: {
  stage_name: "emyth_owner_load";
  context: OwnerLoadStageContext;
  model: StageModelConfig;
}): Promise<StageArtifactMap["emyth_owner_load"]>;
export async function runStage(params: {
  stage_name: "competitive_lens";
  context: CompetitiveLensStageContext;
  model: StageModelConfig;
}): Promise<StageArtifactMap["competitive_lens"]>;
export async function runStage(params: {
  stage_name: "blue_ocean";
  context: BlueOceanStageContext;
  model: StageModelConfig;
}): Promise<StageArtifactMap["blue_ocean"]>;
export async function runStage(params: {
  stage_name: "synthesis_decision";
  context: SynthesisStageContext;
  model: StageModelConfig;
}): Promise<StageArtifactMap["synthesis_decision"]>;
export async function runStage(params: {
  stage_name: StageName;
  context: unknown;
  model: StageModelConfig;
}): Promise<StageArtifactMap[StageName]> {
  if (params.stage_name === "quant_signals") {
    return runQuantSignalsStage({
      context: params.context as QuantStageContext,
      model: params.model,
    });
  }

  if (params.stage_name === "emyth_owner_load") {
    return runEmythOwnerLoadStage({
      context: params.context as OwnerLoadStageContext,
      model: params.model,
    });
  }

  if (params.stage_name === "competitive_lens") {
    return runCompetitiveLensStage({
      context: params.context as CompetitiveLensStageContext,
      model: params.model,
    });
  }

  if (params.stage_name === "blue_ocean") {
    return runBlueOceanStage({
      context: params.context as BlueOceanStageContext,
      model: params.model,
    });
  }

  return runSynthesisDecisionStage({
    context: params.context as SynthesisStageContext,
    model: params.model,
  });
}