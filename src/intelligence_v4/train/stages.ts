import type { StageName } from "../pipeline/contracts";
import { STAGE_INPUT_SCHEMA_VERSION } from "../pipeline/input_contracts";

export type StageTrainingSpec = {
  stage_name: StageName;
  dataset_path: string;
  input_schema_id: string;
  output_schema_id: string;
  default_base_model: string;
  minimum_examples_to_train: number;
};

export const STAGE_TRAINING_SPECS: Record<StageName, StageTrainingSpec> = {
  quant_signals: {
    stage_name: "quant_signals",
    dataset_path: "train/datasets/stage_quant.jsonl",
    input_schema_id: STAGE_INPUT_SCHEMA_VERSION.quant_signals,
    output_schema_id: "quant_signals_v1",
    default_base_model: "gpt-4o-mini-2024-07-18",
    minimum_examples_to_train: 30,
  },
  emyth_owner_load: {
    stage_name: "emyth_owner_load",
    dataset_path: "train/datasets/stage_emyth.jsonl",
    input_schema_id: STAGE_INPUT_SCHEMA_VERSION.emyth_owner_load,
    output_schema_id: "owner_load_v1",
    default_base_model: "gpt-4o-mini-2024-07-18",
    minimum_examples_to_train: 30,
  },
  competitive_lens: {
    stage_name: "competitive_lens",
    dataset_path: "train/datasets/stage_competitive.jsonl",
    input_schema_id: STAGE_INPUT_SCHEMA_VERSION.competitive_lens,
    output_schema_id: "competitive_lens_v1",
    default_base_model: "gpt-4o-mini-2024-07-18",
    minimum_examples_to_train: 30,
  },
  blue_ocean: {
    stage_name: "blue_ocean",
    dataset_path: "train/datasets/stage_blueocean.jsonl",
    input_schema_id: STAGE_INPUT_SCHEMA_VERSION.blue_ocean,
    output_schema_id: "blue_ocean_v1",
    default_base_model: "gpt-4o-mini-2024-07-18",
    minimum_examples_to_train: 30,
  },
  synthesis_decision: {
    stage_name: "synthesis_decision",
    dataset_path: "train/datasets/stage_synthesis.jsonl",
    input_schema_id: STAGE_INPUT_SCHEMA_VERSION.synthesis_decision,
    output_schema_id: "decision_artifact_v1",
    default_base_model: "gpt-4.1-mini-2025-04-14",
    minimum_examples_to_train: 40,
  },
};

export const STAGE_NAMES: StageName[] = Object.keys(STAGE_TRAINING_SPECS) as StageName[];

export function isTrainingStage(value: string): value is StageName {
  return value in STAGE_TRAINING_SPECS;
}

export function getStageTrainingSpec(stage: StageName): StageTrainingSpec {
  return STAGE_TRAINING_SPECS[stage];
}
