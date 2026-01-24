import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { scanObjectForForbidden } from "./lib/forbidden";

type Args = {
  dataset: string;
  n: number;
  out: string;
  seedJsonl: string;
  offenders: string;
};

const DEFAULTS: Args = {
  dataset: "train_v1",
  n: 30,
  out: "./ml_artifacts/train_v2.jsonl",
  seedJsonl: "./ml_artifacts/train_v1_clean.jsonl",
  offenders: "./ml_artifacts/offenders_latest.json",
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    switch (key) {
      case "--dataset":
        if (value) args.dataset = value;
        break;
      case "--n":
        if (value) args.n = Number(value);
        break;
      case "--out":
        if (value) args.out = value;
        break;
      case "--seed_jsonl":
        if (value) args.seedJsonl = value;
        break;
      case "--offenders":
        if (value) args.offenders = value;
        break;
      default:
        break;
    }
  }
  return args;
}

function ensureEnv() {
  if (!process.env.SUPABASE_URL) {
    console.error("Missing SUPABASE_URL environment variable.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }
}

function readJsonl(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJsonl(filePath: string, lines: any[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
  fs.writeFileSync(filePath, payload);
}

function pickCombos(offenders: Record<string, number>, limit: number) {
  return Object.entries(offenders)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => {
      const [term, field] = key.split("::");
      return { term, field };
    });
}

function ensureNoForbidden(output: any) {
  const scan = scanObjectForForbidden(output);
  if (scan.terms.length > 0) {
    console.error("Forbidden terms found in assistant output.");
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  if (!fs.existsSync(args.seedJsonl)) {
    console.error(`Missing seed JSONL: ${args.seedJsonl}`);
    console.error(
      `Seed file not found. Please run: npm run ml:scan-jsonl\n` +
      `This will create a forbidden-term-free seed at ./ml_artifacts/train_v1_clean.jsonl.`
    );
    process.exit(1);
  }
  if (!fs.existsSync(args.offenders)) {
    console.error(`Missing offenders file: ${args.offenders}`);
    process.exit(1);
  }

  const positives = readJsonl(args.seedJsonl);
  const offenders = JSON.parse(fs.readFileSync(args.offenders, "utf8"));

  const combos = pickCombos(offenders.term_field_counts ?? {}, args.n);
  if (combos.length === 0) {
    console.error("No offender combos available.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: dataset, error: datasetError } = await supabase
    .schema("ml")
    .from("datasets")
    .select("example_ids")
    .eq("name", args.dataset)
    .single();

  if (datasetError || !dataset) {
    console.error(`Dataset not found: ${args.dataset}`);
    process.exit(1);
  }

  const { error: datasetUpsertError } = await supabase
    .schema("ml")
    .from("datasets")
    .upsert(
      {
        name: "train_v2",
        purpose: "train",
        schema_version: "snapshot_v1",
        example_ids: dataset.example_ids ?? [],
        frozen_at: new Date().toISOString(),
        metadata: {
          derived_from: args.dataset,
          negatives: args.n,
          jsonl_path: args.out,
        },
      },
      { onConflict: "name" }
    );

  if (datasetUpsertError) {
    console.error(datasetUpsertError.message);
    process.exit(1);
  }

  const negatives: any[] = [];
  const system =
    "You are an internal 2ndmynd decision model. Your job is to reduce owner decision burden by identifying one pattern, one decision, and one boundary. Avoid dashboards, KPIs, monitoring, or performance language. Hard rule: never use forbidden terms. If you see them in a draft, rewrite without them.";

  for (let i = 0; i < args.n; i += 1) {
    const base = positives[i % positives.length];
    const combo = combos[i % combos.length];
    const inputSnapshot = JSON.parse(base.messages[1].content);
    const targetOutput = JSON.parse(base.messages[2].content);

    const badDraft = { ...targetOutput };
    const field = combo.field in badDraft ? combo.field : "decision";
    badDraft[field] = `${badDraft[field]} ${combo.term}`.trim();

    const userPayload = {
      input_snapshot: inputSnapshot,
      bad_draft_output: badDraft,
      instruction: "Rewrite the draft into compliant JSON.",
    };

    ensureNoForbidden(targetOutput);

    negatives.push({
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
        { role: "assistant", content: JSON.stringify(targetOutput) },
      ],
    });
  }

  const combined = [...positives, ...negatives];
  const outPath = path.resolve(args.out);
  writeJsonl(outPath, combined);

  console.log(
    `wrote train_v2.jsonl with ${positives.length} positives and ${negatives.length} negatives`
  );
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
