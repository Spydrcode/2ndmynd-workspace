import crypto from "node:crypto";

import { runMockPackV2 } from "../../lib/decision/v2/mock_pack_v2";

export const tool = {
  name: "datasets.run_mock_pack_v2",
  description: "Run the mock company CSV pack through snapshot_v2 + Decision Layer v2.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["zip_path"],
    properties: {
      zip_path: { type: "string" },
      debug: { type: "boolean" },
      limit: { type: "number" },
      skip_infer: { type: "boolean" },
    },
  },
} as const;

export type RunMockPackV2Args = {
  zip_path: string;
  debug?: boolean;
  limit?: number;
  skip_infer?: boolean;
};

export async function handler(args: RunMockPackV2Args) {
  const intelligenceMode = (process.env.INTELLIGENCE_MODE ?? "mock").toLowerCase();
  const shouldSkipInfer =
    args.skip_infer ?? (!process.env.OPENAI_API_KEY && intelligenceMode !== "mock");
  const run_id = crypto.randomUUID();
  const result = await runMockPackV2({
    zip_path: args.zip_path,
    debug: args.debug,
    limit: args.limit,
    skip_infer: shouldSkipInfer,
  });
  const summary = (result.summary ?? []).map((item: any) => {
    const meta = item?.meta && typeof item.meta === "object" ? item.meta : {};
    return {
      ...item,
      meta: {
        run_id,
        model_id: meta.model_id ?? "unknown",
        rewrite_used: Boolean(meta.rewrite_used),
        fallback_used: Boolean(meta.fallback_used),
        decision_patch_applied: Boolean(meta.decision_patch_applied),
        decision_patch_reason: meta.decision_patch_reason ?? null,
      },
    };
  });
  return {
    summary,
    log_path: result.log_path,
    debug_log_path: result.debug_log_path,
  };
}
