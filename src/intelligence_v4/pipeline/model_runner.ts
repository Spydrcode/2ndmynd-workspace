import type { StageName } from "./contracts";
import { PipelineStageError } from "./errors";
import type { StageModelConfig } from "./model_registry";

type StageModelRunParams<TOutput> = {
  stage_name: StageName;
  model: StageModelConfig;
  schema: Record<string, unknown>;
  prompt: string;
  input: unknown;
  deterministic: () => TOutput;
};

export async function runStageModel<TOutput>(params: StageModelRunParams<TOutput>): Promise<TOutput> {
  if (params.model.model_id.startsWith("deterministic:")) {
    return params.deterministic();
  }

  if (params.model.model_id.startsWith("openai:")) {
    const openaiModel = params.model.model_id.replace(/^openai:/, "");
    if (!process.env.OPENAI_API_KEY) {
      throw new PipelineStageError({
        code: "STAGE_EXECUTION_FAILED",
        stage_name: params.stage_name,
        reason: `OPENAI_API_KEY missing for stage ${params.stage_name}.`,
        next_action: "Set OPENAI_API_KEY or switch this stage to deterministic model_id.",
      });
    }

    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.create({
      model: openaiModel,
      temperature: params.model.temperature,
      max_output_tokens: params.model.max_tokens,
      input: [
        { role: "system", content: params.prompt },
        { role: "user", content: JSON.stringify(params.input) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: `${params.stage_name}_artifact`,
          strict: true,
          schema: params.schema,
        },
      },
    });

    const raw = (response as { output_text?: string }).output_text ?? "";
    if (!raw) {
      throw new PipelineStageError({
        code: "MODEL_OUTPUT_NOT_JSON",
        stage_name: params.stage_name,
        reason: "Model returned empty output.",
        next_action: "Inspect stage prompt and model settings, then rerun.",
      });
    }

    try {
      return JSON.parse(raw) as TOutput;
    } catch {
      throw new PipelineStageError({
        code: "MODEL_OUTPUT_NOT_JSON",
        stage_name: params.stage_name,
        reason: "Model output was not valid JSON.",
        validation_errors: [raw.slice(0, 200)],
        next_action: "Tighten schema constraints and rerun stage.",
      });
    }
  }

  throw new PipelineStageError({
    code: "STAGE_EXECUTION_FAILED",
    stage_name: params.stage_name,
    reason: `Unsupported model provider in model_id: ${params.model.model_id}`,
    next_action: "Use model_id prefix deterministic: or openai: in intelligence_v4.models.json.",
  });
}