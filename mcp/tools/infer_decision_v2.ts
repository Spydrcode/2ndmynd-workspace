import crypto from "node:crypto";

import { inferDecisionV2 } from "../../lib/decision/v2/decision_infer_v2";
import { SnapshotV2 } from "../../lib/decision/v2/conclusion_schema_v2";
import { RunLogger } from "../../lib/intelligence/run_logger";

export const tool = {
  name: "decision.infer_v2",
  description: "Run Decision Layer v2 inference on a snapshot_v2 payload.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["snapshot"],
    properties: {
      snapshot: { type: "object" },
      model_id: { type: "string" },
      micro_rewrite_decision: { type: "boolean" },
      debug: { type: "boolean" },
      run_id: { type: "string" },
    },
  },
} as const;

export type InferDecisionV2Args = {
  snapshot: SnapshotV2;
  model_id?: string;
  micro_rewrite_decision?: boolean;
  debug?: boolean;
  run_id?: string;
};

export async function handler(args: InferDecisionV2Args) {
  const run_id = args.run_id ?? crypto.randomUUID();
  const logger = new RunLogger(run_id);
  const result = await inferDecisionV2(args.snapshot, {
    model: args.model_id,
    micro_rewrite_decision: args.micro_rewrite_decision,
    patch_queue_path: process.env.PATCH_QUEUE_PATH ?? "ml_artifacts/patch_queue.jsonl",
    run_id,
    logger,
  });

  const meta = {
    run_id,
    model_id: result.model_id,
    rewrite_used: result.rewrite_used,
    fallback_used: result.fallback_used,
    decision_patch_applied: result.decision_patch_applied,
    decision_patch_reason: result.decision_patch_reason,
  };

  if (args.debug) {
    return {
      conclusion: result.conclusion,
      meta,
      debug: {
        primary_ok: result.primary_ok,
        schema_errors: result.schema_errors,
        grounding_errors: result.grounding_errors,
        forbidden_terms: result.forbidden_terms,
        season_warnings: result.season_warnings,
        decision_before: result.decision_before,
        decision_after: result.decision_after,
      },
    };
  }

  return { conclusion: result.conclusion, meta };
}
