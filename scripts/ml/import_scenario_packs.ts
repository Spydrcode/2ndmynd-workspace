import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import "dotenv/config";

type Args = {
  dataset: string;
  purpose: "train" | "eval";
  packsDir: string;
  mode: "upsert" | "append";
  rebuildDataset: boolean;
  inputPath?: string;
};

const DEFAULTS: Args = {
  dataset: "scenario_eval_v1",
  purpose: "eval",
  packsDir: "./ml_scenarios",
  mode: "upsert",
  rebuildDataset: true,
};

type ScenarioPack = {
  id: string;
  split: "train" | "eval";
  input_snapshot: unknown;
  expected: {
    conclusion_v1: Record<string, unknown>;
  };
  meta?: Record<string, unknown>;
};

type ImportResult = {
  totalPacks: number;
  selectedPacks: number;
  inserted: number;
  updated: number;
  exampleIds: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    switch (key) {
      case "--dataset":
        if (value) args.dataset = value;
        break;
      case "--purpose":
        if (value === "train" || value === "eval") args.purpose = value;
        break;
      case "--packs_dir":
        if (value) args.packsDir = value;
        break;
      case "--mode":
        if (value === "append" || value === "upsert") args.mode = value;
        break;
      case "--rebuild_dataset":
        args.rebuildDataset = value ? value !== "false" : true;
        break;
      case "--in":
        if (value) args.inputPath = value;
        break;
      default:
        break;
    }
  }
  return args;
}

function ensureEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map((key) => `"${key}":${stableStringify(obj[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function loadPacks(packsDir: string, inputPath?: string) {
  const packPath = inputPath
    ? path.resolve(inputPath)
    : path.resolve(packsDir, "packs.json");
  const jsonlPath = inputPath
    ? path.resolve(inputPath)
    : path.resolve(packsDir, "packs.jsonl");

  if (fs.existsSync(packPath)) {
    return JSON.parse(fs.readFileSync(packPath, "utf8")) as ScenarioPack[];
  }

  if (fs.existsSync(jsonlPath)) {
    const lines = fs.readFileSync(jsonlPath, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.map((line) => JSON.parse(line)) as ScenarioPack[];
  }

  console.error(`Missing packs file: ${packPath} or ${jsonlPath}`);
  process.exit(1);
}

function mergeMeta(existing: Record<string, unknown> | null | undefined, incoming: Record<string, unknown>) {
  return {
    ...(existing ?? {}),
    ...incoming,
  };
}

function qualityRank(value: string | null | undefined) {
  switch (value) {
    case "approved":
      return 3;
    case "reviewed":
      return 2;
    case "draft":
      return 1;
    case "retired":
      return 0;
    default:
      return 0;
  }
}

async function getExampleColumns(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .schema("information_schema")
    .from("columns")
    .select("column_name")
    .eq("table_schema", "ml")
    .eq("table_name", "examples");

  if (error) {
    console.error(`Failed to load columns: ${error.message}`);
    process.exit(1);
  }

  return new Set((data ?? []).map((row: { column_name: string }) => row.column_name));
}

export async function importScenarioPacks(args: Args): Promise<ImportResult> {
  ensureEnv();

  const packs = loadPacks(args.packsDir, args.inputPath);
  if (!Array.isArray(packs) || packs.length === 0) {
    console.error("No scenario packs found.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const exampleColumns = await getExampleColumns(supabase);

  const selected = packs.filter((pack) => pack.split === args.purpose);
  const exampleIds: string[] = [];
  let inserted = 0;
  let updated = 0;

  for (const pack of selected) {
    const inputHash = sha256(stableStringify(pack.input_snapshot));
    const targetHash = sha256(stableStringify(pack.expected.conclusion_v1));
    const exampleHash = sha256(`${inputHash}:${targetHash}`);

    const importMeta = {
      ...(pack.meta ?? {}),
      import_hashes: {
        input_hash: inputHash,
        target_hash: targetHash,
        example_hash: exampleHash,
      },
    };

    const exampleBase = {
      id: pack.id,
      purpose: pack.split,
      schema_version: "snapshot_v1",
      input_snapshot: pack.input_snapshot,
      target_output: pack.expected.conclusion_v1,
      meta: importMeta,
      tags: ["scenario_pack"],
      quality: "approved",
    } as Record<string, unknown>;

    if (exampleColumns.has("hash")) {
      exampleBase.hash = exampleHash;
    }

    if (args.mode === "append") {
      const { error } = await supabase
        .schema("ml")
        .from("examples")
        .upsert(exampleBase, { onConflict: "id" });

      if (error) {
        console.error(`Insert failed for ${pack.id}: ${error.message}`);
        process.exit(1);
      }

      inserted += 1;
      exampleIds.push(pack.id);
      continue;
    }

    const { data: existing, error: lookupError } = await supabase
      .schema("ml")
      .from("examples")
      .select("id, meta, quality")
      .eq("meta->import_hashes->>example_hash", exampleHash)
      .maybeSingle();

    if (lookupError) {
      console.error(`Lookup failed for ${pack.id}: ${lookupError.message}`);
      process.exit(1);
    }

    if (existing?.id) {
      const mergedMeta = mergeMeta(existing.meta as Record<string, unknown> | null | undefined, importMeta);
      const incomingQuality = exampleBase.quality as string;
      const keepQuality = qualityRank(existing.quality as string | null | undefined) >= qualityRank(incomingQuality)
        ? existing.quality
        : incomingQuality;

      const { error } = await supabase
        .schema("ml")
        .from("examples")
        .update({
          meta: mergedMeta,
          quality: keepQuality,
        })
        .eq("id", existing.id);

      if (error) {
        console.error(`Update failed for ${existing.id}: ${error.message}`);
        process.exit(1);
      }

      updated += 1;
      exampleIds.push(existing.id);
    } else {
      const { error } = await supabase
        .schema("ml")
        .from("examples")
        .insert(exampleBase);

      if (error) {
        console.error(`Insert failed for ${pack.id}: ${error.message}`);
        process.exit(1);
      }

      inserted += 1;
      exampleIds.push(pack.id);
    }
  }

  if (args.rebuildDataset) {
    const { error } = await supabase
      .schema("ml")
      .from("datasets")
      .upsert(
        {
          name: args.dataset,
          purpose: args.purpose,
          schema_version: "snapshot_v1",
          example_ids: exampleIds,
          frozen_at: new Date().toISOString(),
          description: "Scenario pack eval set",
        },
        { onConflict: "name" }
      );

    if (error) {
      console.error(`Failed to rebuild dataset ${args.dataset}: ${error.message}`);
      process.exit(1);
    }
  }

  return {
    totalPacks: packs.length,
    selectedPacks: selected.length,
    inserted,
    updated,
    exampleIds,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await importScenarioPacks(args);

  console.log(`total packs: ${result.totalPacks}`);
  console.log(`selected packs: ${result.selectedPacks}`);
  console.log(`inserted: ${result.inserted}`);
  console.log(`updated: ${result.updated}`);
  console.log(`dataset examples: ${result.exampleIds.length}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
