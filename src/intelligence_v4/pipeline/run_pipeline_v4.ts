import { STAGE_ORDER, type StageArtifactMap, validateStageArtifact } from "./contracts";
import {
  buildStageContext,
  buildStageInput,
  createRuntimeState,
  type BlueOceanStageContext,
  type CompetitiveLensStageContext,
  type OwnerLoadStageContext,
  type PipelineRunInputV4,
  type QuantStageContext,
  type SynthesisStageContext,
} from "./context_builder";
import { PipelineStageError, toStageFailureArtifact } from "./errors";
import { runDoctrineGuards, runGlobalDoctrineGuards } from "./guards";
import { validateStageInput } from "./input_schemas";
import { getStageModelConfig, type StageModelConfig } from "./model_registry";
import { runStage } from "./stage_registry";
import {
  persistPipelineFailure,
  persistPipelineSuccess,
  persistStageInput,
  persistStageOutput,
} from "./artifact_store";

async function executeStage(params: {
  stage_name: keyof StageArtifactMap;
  stage_context: unknown;
  model: StageModelConfig;
}): Promise<StageArtifactMap[keyof StageArtifactMap]> {
  if (params.stage_name === "quant_signals") {
    return runStage({
      stage_name: "quant_signals",
      context: params.stage_context as QuantStageContext,
      model: params.model,
    });
  }
  if (params.stage_name === "emyth_owner_load") {
    return runStage({
      stage_name: "emyth_owner_load",
      context: params.stage_context as OwnerLoadStageContext,
      model: params.model,
    });
  }
  if (params.stage_name === "competitive_lens") {
    return runStage({
      stage_name: "competitive_lens",
      context: params.stage_context as CompetitiveLensStageContext,
      model: params.model,
    });
  }
  if (params.stage_name === "blue_ocean") {
    return runStage({
      stage_name: "blue_ocean",
      context: params.stage_context as BlueOceanStageContext,
      model: params.model,
    });
  }
  return runStage({
    stage_name: "synthesis_decision",
    context: params.stage_context as SynthesisStageContext,
    model: params.model,
  });
}

export type PipelineV4Success = {
  ok: true;
  run_id: string;
  workspace_id: string;
  stage_artifacts: StageArtifactMap;
  presented_decision_v1: StageArtifactMap["synthesis_decision"];
};

export type PipelineV4Failure = {
  ok: false;
  run_id: string;
  workspace_id: string;
  error: {
    stage_failed: string;
    reason: string;
    validation_errors: string[];
    guard_failures: string[];
    next_action: string;
  };
};

function setStageArtifact(
  stateArtifacts: Partial<StageArtifactMap>,
  stageName: keyof StageArtifactMap,
  artifact: StageArtifactMap[keyof StageArtifactMap]
) {
  if (stageName === "quant_signals") {
    stateArtifacts.quant_signals = artifact as StageArtifactMap["quant_signals"];
    return;
  }
  if (stageName === "emyth_owner_load") {
    stateArtifacts.emyth_owner_load = artifact as StageArtifactMap["emyth_owner_load"];
    return;
  }
  if (stageName === "competitive_lens") {
    stateArtifacts.competitive_lens = artifact as StageArtifactMap["competitive_lens"];
    return;
  }
  if (stageName === "blue_ocean") {
    stateArtifacts.blue_ocean = artifact as StageArtifactMap["blue_ocean"];
    return;
  }
  stateArtifacts.synthesis_decision = artifact as StageArtifactMap["synthesis_decision"];
}

export async function runPipelineV4(input: PipelineRunInputV4): Promise<PipelineV4Success | PipelineV4Failure> {
  const state = createRuntimeState(input);

  for (const stageName of STAGE_ORDER) {
    try {
      const stageContext = buildStageContext(stageName, state);
      const stageInput = buildStageInput(stageName, state);
      const model = getStageModelConfig({
        stage_name: stageName,
        industry: input.industry,
      });

      const inputValidation = validateStageInput(stageName, stageInput);
      const inputGuards = runGlobalDoctrineGuards(stageName, stageInput);
      await persistStageInput({
        run_id: input.run_id,
        workspace_id: input.workspace_id,
        stage_name: stageName,
        payload: stageInput,
        model_config: model,
        guard_results: inputGuards,
        validation_results: inputValidation,
      });

      if (!inputValidation.ok) {
        throw new PipelineStageError({
          code: "SCHEMA_VALIDATION_FAILED",
          stage_name: stageName,
          reason: `Stage input for ${stageName} failed schema validation.`,
          validation_errors: inputValidation.errors,
          next_action: "Fix stage input contract or context builder output before rerun.",
        });
      }

      if (!inputGuards.passed) {
        throw new PipelineStageError({
          code: "DOCTRINE_GUARD_FAILED",
          stage_name: stageName,
          reason: `Stage input for ${stageName} failed doctrine guards.`,
          guard_failures: inputGuards.failures.map((failure) => failure.message),
          next_action: "Remove unsafe input content before rerun.",
        });
      }

      const artifact = await executeStage({
        stage_name: stageName,
        stage_context: stageContext,
        model,
      });

      const outputValidation = validateStageArtifact(stageName, artifact);
      if (!outputValidation.ok) {
        throw new PipelineStageError({
          code: "SCHEMA_VALIDATION_FAILED",
          stage_name: stageName,
          reason: `Stage ${stageName} output failed schema validation.`,
          validation_errors: outputValidation.errors,
          next_action: "Fix stage output to match contract and rerun.",
        });
      }

      const guards = runDoctrineGuards(stageName, artifact);
      if (!guards.passed) {
        throw new PipelineStageError({
          code: "DOCTRINE_GUARD_FAILED",
          stage_name: stageName,
          reason: `Stage ${stageName} failed doctrine gates.`,
          guard_failures: guards.failures.map((failure) => failure.message),
          next_action: "Fix doctrine violations and rerun.",
        });
      }

      setStageArtifact(state.artifacts, stageName, artifact);

      await persistStageOutput({
        run_id: input.run_id,
        workspace_id: input.workspace_id,
        stage_name: stageName,
        payload: artifact,
        model_config: model,
        guard_results: guards,
        validation_results: outputValidation,
      });
    } catch (error) {
      const failure = toStageFailureArtifact(error, stageName);
      await persistPipelineFailure({
        run_id: input.run_id,
        workspace_id: input.workspace_id,
        error: failure,
      });
      return {
        ok: false,
        run_id: input.run_id,
        workspace_id: input.workspace_id,
        error: failure,
      };
    }
  }

  if (!state.artifacts.synthesis_decision) {
    const failure = {
      stage_failed: "synthesis_decision",
      reason: "Pipeline completed without final artifact.",
      validation_errors: [],
      guard_failures: [],
      next_action: "Inspect stage outputs and rerun pipeline.",
    };
    await persistPipelineFailure({
      run_id: input.run_id,
      workspace_id: input.workspace_id,
      error: failure,
    });
    return {
      ok: false,
      run_id: input.run_id,
      workspace_id: input.workspace_id,
      error: failure,
    };
  }

  const stageArtifacts = state.artifacts as StageArtifactMap;

  await persistPipelineSuccess({
    run_id: input.run_id,
    workspace_id: input.workspace_id,
    final_artifact: stageArtifacts.synthesis_decision,
  });

  return {
    ok: true,
    run_id: input.run_id,
    workspace_id: input.workspace_id,
    stage_artifacts: stageArtifacts,
    presented_decision_v1: stageArtifacts.synthesis_decision,
  };
}
