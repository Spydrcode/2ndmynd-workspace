import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Args = {
  inPath: string;
  index: number;
  company?: string;
  serverCmd: string;
  serverArgs: string[];
  cwd?: string;
};

const DEFAULTS: Args = {
  inPath: path.resolve("ml_artifacts", "mock_companies_3mo", "run_results.jsonl"),
  index: 0,
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
      case "--in":
        if (value) args.inPath = value;
        break;
      case "--index":
        if (value) args.index = Number(value);
        break;
      case "--company":
        if (value) args.company = value;
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

export async function runIntelligenceReplay(argv: string[] = process.argv.slice(2)) {
  process.env.INTELLIGENCE_MODE = "mock";
  const args = parseArgs(argv);

  const raw = fs.readFileSync(args.inPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);

  const filtered = args.company
    ? records.filter((record) => record.company === args.company)
    : records;
  const target = filtered[args.index];

  if (!target) {
    throw new Error("No matching record found to replay.");
  }

  const snapshot = target.snapshot;
  if (!snapshot) {
    throw new Error("Selected record does not contain a snapshot.");
  }

  const transport = new StdioClientTransport({
    command: args.serverCmd,
    args: args.serverArgs,
    cwd: args.cwd,
  });
  const client = new Client(
    { name: "2ndmynd-intelligence-replay", version: "0.1.0" },
    { capabilities: {} }
  );
  await client.connect(transport);

  try {
    const pipelineResult = await client.callTool({
      name: "pipeline.run_v2",
      arguments: {
        mode: "raw_snapshot",
        payload: { snapshot },
      },
    });
    const pipelinePayload = decodeToolResult(pipelineResult) as { conclusion?: unknown };

    const validateResult = await client.callTool({
      name: "decision.validate_v2",
      arguments: {
        snapshot,
        conclusion: pipelinePayload.conclusion,
      },
    });
    const validatePayload = decodeToolResult(validateResult) as Record<string, unknown>;

    const output = {
      company: target.company ?? null,
      ok: (validatePayload as { ok?: boolean }).ok ?? false,
      errors: (validatePayload as { errors?: string[] }).errors ?? [],
    };

    console.log(JSON.stringify(output, null, 2));
    return output;
  } finally {
    await client.close();
  }
}

async function main() {
  await runIntelligenceReplay();
}

main().catch((error) => {
  console.error("Intelligence replay failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
