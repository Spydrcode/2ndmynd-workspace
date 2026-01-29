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
  const result = await runMockPackV2({
    zip_path: args.zip_path,
    debug: args.debug,
    limit: args.limit,
    skip_infer: args.skip_infer ?? !process.env.OPENAI_API_KEY,
  });
  return {
    summary: result.summary,
    log_path: result.log_path,
    debug_log_path: result.debug_log_path,
  };
}
