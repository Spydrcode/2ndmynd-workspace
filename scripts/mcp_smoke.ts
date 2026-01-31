import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Args = {
  zip: string;
  limit: number;
  serverCmd: string;
  serverArgs: string[];
  cwd?: string;
};

const DEFAULTS: Args = {
  zip: path.resolve("scripts", "ml", "mock_company_datasets_3mo_plus_outlier.zip"),
  limit: 1,
  serverCmd: "npx",
  serverArgs: ["tsx", "mcp/server.ts"],
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--zip":
        if (value) args.zip = value;
        break;
      case "--limit":
        if (value) args.limit = Number(value);
        break;
      case "--server_cmd":
        if (value) args.serverCmd = value;
        break;
      case "--server_args":
        if (value) args.serverArgs = value.split(" ").filter(Boolean);
        break;
      case "--cwd":
        if (value) args.cwd = value;
        break;
      default:
        break;
    }
  }
  return args;
}

function decodeToolResult(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export async function runMcpSmoke(argv: string[] = process.argv.slice(2)) {
  process.env.INTELLIGENCE_MODE = "mock";
  const run_id = crypto.randomUUID();

  const args = parseArgs(argv);
  const transport = new StdioClientTransport({
    command: args.serverCmd,
    args: args.serverArgs,
    cwd: args.cwd,
  });

  const client = new Client(
    { name: "2ndmynd-mcp-smoke", version: "0.1.0" },
    { capabilities: {} }
  );
  await client.connect(transport);

  try {
    const mockResult = await client.callTool({
      name: "datasets.run_mock_pack_v2",
      arguments: {
        zip_path: args.zip,
        debug: true,
        limit: args.limit,
        skip_infer: true,
      },
    });
    const mockPayload = decodeToolResult(mockResult) as {
      summary?: Array<Record<string, unknown>>;
    };

    const summary = Array.isArray(mockPayload.summary) ? mockPayload.summary : [];
    const withSnapshot = summary.find(
      (item) => item && typeof item === "object" && "snapshot" in item
    ) as { snapshot?: unknown } | undefined;

    if (!withSnapshot?.snapshot) {
      throw new Error("No snapshot returned from datasets.run_mock_pack_v2.");
    }

    const pipelineResult = await client.callTool({
      name: "pipeline.run_v2",
      arguments: {
        mode: "raw_snapshot",
        payload: { snapshot: withSnapshot.snapshot, run_id },
      },
    });
    decodeToolResult(pipelineResult);

    const inferResult = await client.callTool({
      name: "decision.infer_v2",
      arguments: { snapshot: withSnapshot.snapshot, run_id },
    });
    const inferPayload = decodeToolResult(inferResult) as { conclusion?: unknown };

    const validateResult = await client.callTool({
      name: "decision.validate_v2",
      arguments: {
        snapshot: withSnapshot.snapshot,
        conclusion: inferPayload.conclusion,
      },
    });
    const validatePayload = decodeToolResult(validateResult) as { ok?: boolean; errors?: string[] };

    if (!validatePayload.ok) {
      throw new Error(
        `decision.validate_v2 failed: ${JSON.stringify(validatePayload.errors ?? [])}`
      );
    }

    console.log("MCP smoke test passed");
  } finally {
    await client.close();
  }
}

async function main() {
  await runMcpSmoke();
}

main().catch((error) => {
  console.error("MCP smoke test failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
