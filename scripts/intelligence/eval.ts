import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { RunLogger } from "../../lib/intelligence/run_logger";

type Args = {
  zip: string;
  n: number;
  out: string;
  serverCmd: string;
  serverArgs: string[];
  cwd?: string;
};

const DEFAULTS: Args = {
  zip: path.resolve("scripts", "ml", "mock_company_datasets_3mo_plus_outlier.zip"),
  n: 10,
  out: path.resolve("runs", "summary.json"),
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
      case "--n":
        if (value) args.n = Number(value);
        break;
      case "--out":
        if (value) args.out = value;
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

export async function runIntelligenceEval(argv: string[] = process.argv.slice(2)) {
  process.env.INTELLIGENCE_MODE = "mock";

  const args = parseArgs(argv);
  const run_id = crypto.randomUUID();
  const logger = new RunLogger(run_id);
  const startedAt = new Date();
  logger.logEvent("eval.start", { n: args.n, zip_path: args.zip, mode: "mock", run_id });

  const transport = new StdioClientTransport({
    command: args.serverCmd,
    args: args.serverArgs,
    cwd: args.cwd,
  });
  const client = new Client(
    { name: "2ndmynd-intelligence-eval", version: "0.1.0" },
    { capabilities: {} }
  );
  await client.connect(transport);

  let passed = 0;
  let failed = 0;
  const latencies: number[] = [];

  try {
    const mockResult = await client.callTool({
      name: "datasets.run_mock_pack_v2",
      arguments: {
        zip_path: args.zip,
        debug: true,
        limit: args.n,
        skip_infer: true,
      },
    });
    const mockPayload = decodeToolResult(mockResult) as {
      summary?: Array<Record<string, unknown>>;
    };

    const summary = Array.isArray(mockPayload.summary) ? mockPayload.summary : [];
    const items = summary.filter(
      (item) => item && typeof item === "object" && "snapshot" in item
    ) as Array<{ snapshot?: unknown; company?: string }>;

    for (const item of items.slice(0, args.n)) {
      if (!item.snapshot) continue;
      const startMs = Date.now();
      const pipelineResult = await client.callTool({
        name: "pipeline.run_v2",
        arguments: {
          mode: "raw_snapshot",
          payload: { snapshot: item.snapshot, run_id },
        },
      });
      const pipelinePayload = decodeToolResult(pipelineResult) as { conclusion?: unknown };

      const validateResult = await client.callTool({
        name: "decision.validate_v2",
        arguments: {
          snapshot: item.snapshot,
          conclusion: pipelinePayload.conclusion,
        },
      });
      const validatePayload = decodeToolResult(validateResult) as { ok?: boolean; errors?: string[] };

      const durationMs = Date.now() - startMs;
      latencies.push(durationMs);

      if (validatePayload.ok) {
        passed += 1;
        logger.logEvent("eval.run", {
          company: item.company ?? null,
          ok: true,
          duration_ms: durationMs,
        });
      } else {
        failed += 1;
        logger.logEvent("eval.run", {
          company: item.company ?? null,
          ok: false,
          duration_ms: durationMs,
          errors: validatePayload.errors ?? [],
        });
      }
    }
  } finally {
    await client.close();
  }

  const total = passed + failed;
  const meanLatency = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : 0;

  const summary = {
    run_id: logger.run_id,
    mode: "mock",
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    total,
    passed,
    failed,
    pass_rate: total > 0 ? Number((passed / total).toFixed(4)) : 0,
    mean_latency_ms: meanLatency,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(summary, null, 2));
  logger.logEvent("eval.complete", summary);

  return summary;
}

async function main() {
  const summary = await runIntelligenceEval();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("Intelligence eval failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
