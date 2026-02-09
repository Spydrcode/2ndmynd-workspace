import fs from "node:fs";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Args = {
  zip?: string;
  out: string;
  limit?: number;
  serverCmd: string;
  serverArgs: string[];
  cwd?: string;
};

const DEFAULTS: Args = {
  out: "ml_artifacts/mcp_runs.jsonl",
  serverCmd: "npm",
  serverArgs: ["run", "mcp:server", "--"],
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--zip":
        args.zip = value;
        break;
      case "--out":
        if (value) args.out = value;
        break;
      case "--limit":
        args.limit = Number(value);
        break;
      case "--server_cmd":
        if (value) args.serverCmd = value;
        break;
      case "--server_args":
        if (value) {
          args.serverArgs = value.split(" ").filter(Boolean);
        }
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

function writeJsonl(pathStr: string, record: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(pathStr), { recursive: true });
  fs.appendFileSync(pathStr, `${JSON.stringify(record)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.zip) {
    console.error("Missing --zip <path>.");
    process.exit(1);
  }

  const transport = new StdioClientTransport({
    command: args.serverCmd,
    args: args.serverArgs,
    cwd: args.cwd,
  });
  const client = new Client(
    { name: "2ndmynd-mcp-demo", version: "0.1.0" },
    { capabilities: {} }
  );
  await client.connect(transport);

  const outPath = path.resolve(args.out);

  const callMockPack = async (skipInfer: boolean) =>
    client.callTool({
      name: "datasets.run_mock_pack_v2",
      arguments: {
        zip_path: args.zip,
        debug: true,
        limit: args.limit,
        skip_infer: skipInfer,
      },
    });

  let mockResult;
  let skipInfer = !process.env.OPENAI_API_KEY;
  try {
    mockResult = await callMockPack(skipInfer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Missing OPENAI_API_KEY")) {
      skipInfer = true;
      mockResult = await callMockPack(true);
    } else {
      throw error;
    }
  }
  const mockPayload = decodeToolResult(mockResult) as {
    summary?: Array<Record<string, unknown>>;
    log_path?: string;
    debug_log_path?: string;
  };

  const summary = Array.isArray(mockPayload.summary) ? mockPayload.summary : [];
  summary.forEach((item) => {
    writeJsonl(outPath, {
      tool: "datasets.run_mock_pack_v2",
      timestamp: new Date().toISOString(),
      ...item,
    });
  });

  const firstWithSnapshot = summary.find(
    (item) => item && typeof item === "object" && "snapshot" in item
  ) as { snapshot?: unknown; conclusion?: unknown; company?: string } | undefined;

  if (!firstWithSnapshot?.snapshot) {
    throw new Error("No snapshot returned from datasets.run_mock_pack_v2.");
  }

  if (skipInfer || !process.env.OPENAI_API_KEY) {
    writeJsonl(outPath, {
      tool: "decision.infer_v2",
      timestamp: new Date().toISOString(),
      snapshot: firstWithSnapshot.snapshot,
      conclusion: null,
      meta: { stage: "missing_openai_key" },
    });
    writeJsonl(outPath, {
      tool: "decision.validate_v2",
      timestamp: new Date().toISOString(),
      snapshot: firstWithSnapshot.snapshot,
      conclusion: null,
      ok: false,
      errors: ["missing_openai_key"],
      meta: { stage: "missing_openai_key" },
    });
    console.log(
      JSON.stringify(
        {
          log_path: outPath,
          mock_pack_count: summary.length,
          message: "OPENAI_API_KEY missing; wrote snapshots with conclusion=null.",
        },
        null,
        2
      )
    );
    await client.close();
    return;
  }

  const inferResult = await client.callTool({
    name: "decision.infer_v2",
    arguments: {
      snapshot: firstWithSnapshot.snapshot,
    },
  });
  const inferPayload = decodeToolResult(inferResult) as Record<string, unknown>;
  writeJsonl(outPath, {
    tool: "decision.infer_v2",
    timestamp: new Date().toISOString(),
    snapshot: firstWithSnapshot.snapshot,
    ...inferPayload,
  });

  const validateResult = await client.callTool({
    name: "decision.validate_v2",
    arguments: {
      snapshot: firstWithSnapshot.snapshot,
      conclusion: (inferPayload as { conclusion?: unknown }).conclusion,
    },
  });
  const validatePayload = decodeToolResult(validateResult) as Record<string, unknown>;
  writeJsonl(outPath, {
    tool: "decision.validate_v2",
    timestamp: new Date().toISOString(),
    snapshot: firstWithSnapshot.snapshot,
    conclusion: (inferPayload as { conclusion?: unknown }).conclusion,
    ...validatePayload,
  });

  console.log(
    JSON.stringify(
      {
        log_path: outPath,
        mock_pack_count: summary.length,
        validate: validatePayload,
      },
      null,
      2
    )
  );

  await client.close();
}

main().catch((error) => {
  console.error("MCP demo failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
