import fs from "node:fs";
import path from "node:path";
import { SnapshotV2 } from "./lib/conclusion_schema_v2";
import { inferDecisionV2 } from "./lib/decision_infer_v2";

type Args = {
  model?: string;
  inputPath?: string;
  json?: string;
  microRewriteDecision?: boolean;
};

function parseBool(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  const normalized = value.toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  return defaultValue;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    switch (key) {
      case "--model":
        if (value) args.model = value;
        break;
      case "--in":
        if (value) args.inputPath = value;
        break;
      case "--json":
        if (value) args.json = value;
        break;
      case "--micro_rewrite_decision":
        args.microRewriteDecision = parseBool(value, true);
        break;
      default:
        break;
    }
  }
  return args;
}

function ensureEnv() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY environment variable.");
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  if (!args.inputPath && !args.json) {
    console.error("Provide --in <path> or --json <stringified json>.");
    process.exit(1);
  }

  let inputJson = args.json ?? "";
  if (args.inputPath) {
    const inputPath = path.resolve(args.inputPath);
    if (!fs.existsSync(inputPath)) {
      console.error(`Missing file: ${inputPath}`);
      process.exit(1);
    }
    inputJson = fs.readFileSync(inputPath, "utf8");
  }

  let inputSnapshot: SnapshotV2;
  try {
    inputSnapshot = JSON.parse(inputJson) as SnapshotV2;
  } catch {
    console.error("Input snapshot is not valid JSON.");
    process.exit(1);
  }

  const result = await inferDecisionV2(inputSnapshot, {
    model: args.model,
    micro_rewrite_decision: args.microRewriteDecision,
  });
  console.log(JSON.stringify(result.conclusion, null, 2));
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
