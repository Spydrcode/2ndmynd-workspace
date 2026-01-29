import { inferDecisionV2 } from "../../lib/decision/v2/decision_infer_v2";
import { SnapshotV2 } from "../../lib/decision/v2/conclusion_schema_v2";
import { runPipelineV2, PipelineInput } from "../../lib/decision/v2/run_pipeline_v2";
import { runMockPackV2 } from "../../lib/decision/v2/mock_pack_v2";

export const tool = {
  name: "pipeline.run_v2",
  description: "Run the Decision Layer v2 pipeline in jobber_csv, mock_pack, or raw_snapshot mode.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["mode", "payload"],
    properties: {
      mode: { type: "string", enum: ["jobber_csv", "mock_pack", "raw_snapshot"] },
      payload: { type: "object" },
    },
  },
} as const;

export type RunPipelineV2Args = {
  mode: "jobber_csv" | "mock_pack" | "raw_snapshot";
  payload: Record<string, unknown>;
};

export async function handler(args: RunPipelineV2Args) {
  if (args.mode === "raw_snapshot") {
    const snapshot = args.payload.snapshot as SnapshotV2 | undefined;
    if (!snapshot) {
      throw new Error("raw_snapshot mode requires payload.snapshot");
    }
    const result = await inferDecisionV2(snapshot, {
      model: typeof args.payload.model_id === "string" ? args.payload.model_id : undefined,
      micro_rewrite_decision:
        typeof args.payload.micro_rewrite_decision === "boolean"
          ? args.payload.micro_rewrite_decision
          : undefined,
      patch_queue_path: process.env.PATCH_QUEUE_PATH ?? "ml_artifacts/patch_queue.jsonl",
    });
    return {
      conclusion: result.conclusion,
      meta: {
        model_id: result.model_id,
        rewrite_used: result.rewrite_used,
        fallback_used: result.fallback_used,
        decision_patch_applied: result.decision_patch_applied,
        decision_patch_reason: result.decision_patch_reason,
      },
    };
  }

  if (args.mode === "mock_pack") {
    const zipPath = args.payload.zip_path;
    if (typeof zipPath !== "string") {
      throw new Error("mock_pack mode requires payload.zip_path");
    }
    const result = await runMockPackV2({
      zip_path: zipPath,
      debug: args.payload.debug === true,
      limit: typeof args.payload.limit === "number" ? args.payload.limit : undefined,
    });
    return {
      summary: result.summary,
      artifacts: {
        log_path: result.log_path,
        debug_log_path: result.debug_log_path,
      },
    };
  }

  const input = args.payload as PipelineInput;
  if (!input || typeof input.source !== "string") {
    throw new Error("jobber_csv mode requires payload with source/quotes/invoices");
  }
  const result = await runPipelineV2(input, {
    patch_queue_path: process.env.PATCH_QUEUE_PATH ?? "ml_artifacts/patch_queue.jsonl",
    write_log: true,
  });
  return {
    conclusion: result.conclusion,
    meta: result.meta,
    artifacts: {
      log_path: result.log_path,
      validator_failures: result.validator_failures,
      pii_findings: result.pii_findings,
      season_warnings: result.season_warnings,
    },
  };
}
