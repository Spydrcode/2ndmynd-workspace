import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { scanObjectForForbidden } from "./lib/forbidden";
import { validateConclusion, validateGrounding } from "./lib/conclusion_schema";

require('dotenv').config();

type Args = {
  name: string;
  out?: string;
};

const DEFAULTS: Args = {
  name: "train_v1",
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (value === undefined) continue;

    switch (key) {
      case "--name":
        args.name = value;
        break;
      case "--dataset":
        args.name = value;
        break;
      case "--out":
        args.out = value;
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



export async function exportDatasetToJsonl(args: Args) {
  const datasetName = args.name;
  const outPath = path.resolve(args.out ?? `./ml_artifacts/${datasetName}.jsonl`);
  ensureEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: dataset, error: datasetError } = await supabase
    .schema("ml")
    .from("datasets")
    .select("name, schema_version, example_ids")
    .eq("name", datasetName)
    .single();

  if (datasetError || !dataset) {
    throw new Error(`Dataset not found: ${datasetName}`);
  }

  const exampleIds = dataset.example_ids ?? [];
  if (exampleIds.length === 0) {
    throw new Error("No examples in dataset.");
  }

  const exampleMap = new Map<string, any>();
  const chunkSize = 100;
  for (let i = 0; i < exampleIds.length; i += chunkSize) {
    const chunk = exampleIds.slice(i, i + chunkSize);
    const { data: examples, error: examplesError } = await supabase
      .schema("ml")
      .from("examples")
      .select("id, input_snapshot, target_output, schema_version")
      .in("id", chunk)
      .eq("schema_version", dataset.schema_version);

    if (examplesError) {
      throw new Error(`Fetch failed: ${examplesError.message}`);
    }

    for (const example of examples ?? []) {
      exampleMap.set(example.id, example);
    }
  }

  const lines: string[] = [];
  const invalid: string[] = [];

  for (const id of exampleIds) {
    const example = exampleMap.get(id);
    if (!example) continue;

    const errors = validateExample({
      id: example.id,
      input_snapshot: example.input_snapshot,
      target_output: example.target_output,
    });

    if (errors.length > 0) {
      invalid.push(`${example.id}: ${errors.join(", ")}`);
      continue;
    }

    const payload = {
      messages: [
        {
          role: "system",
          content:
            "You are an internal 2ndmynd decision model. Output ONLY valid JSON with the required schema. Never use forbidden terms. evidence_signals must be 3-6 keys that exist in input_snapshot.signals.",
        },
        {
          role: "user",
          content: JSON.stringify({ input_snapshot: example.input_snapshot }),
        },
        {
          role: "assistant",
          content: JSON.stringify(example.target_output),
        },
      ],
    };

    const line = JSON.stringify(payload);
    if (line.length > 20000) {
      invalid.push(`${example.id}: line too long (${line.length} chars)`);
      continue;
    }

    lines.push(line);
  }

  if (invalid.length > 0) {
    throw new Error(invalid.join("\n"));
  }

  if (lines.length === 0) {
    throw new Error("No valid examples to export.");
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`);

  console.log(`exported ${lines.length} examples to ${outPath}`);
}

function validateExample(example: { id: string; input_snapshot: any; target_output: any }): string[] {
  const errors: string[] = [];

  // Validate input_snapshot
  const snapshot = example.input_snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    errors.push("input_snapshot missing or not object");
    return errors;
  }

  if (snapshot.snapshot_version !== "snapshot_v1") {
    errors.push("snapshot_version not snapshot_v1");
  }

  if (snapshot.pii_scrubbed !== true) {
    errors.push("pii_scrubbed not true");
  }

  if (!snapshot.signals || typeof snapshot.signals !== "object") {
    errors.push("signals missing or not object");
  } else {
    for (const [key, value] of Object.entries(snapshot.signals)) {
      if (key.length > 64) {
        errors.push(`signal key too long: ${key.length}`);
      }
      // Allow strings, numbers, booleans, arrays, objects
      if (typeof value === "string" && value.length > 1000) {
        errors.push(`signal ${key} string value too long: ${value.length}`);
      }
      // Ensure it's JSON serializable
      try {
        JSON.stringify(value);
      } catch {
        errors.push(`signal ${key} not JSON serializable`);
      }
    }
  }

  // Validate target_output
  const output = example.target_output;
  if (!output || typeof output !== "object") {
    errors.push("target_output missing or not object");
  } else {
    // Check forbidden
    const forbidden = scanObjectForForbidden(output);
    if (forbidden.terms.length > 0) {
      errors.push(`forbidden terms: ${forbidden.terms.join(", ")}`);
    }

    // Check evidence_signals
    if (!output.evidence_signals || !Array.isArray(output.evidence_signals)) {
      errors.push("evidence_signals missing or not array");
    } else {
      const len = output.evidence_signals.length;
      if (len < 3 || len > 6) {
        errors.push(`evidence_signals length ${len} not 3-6`);
      }
      for (const sig of output.evidence_signals) {
        if (typeof sig !== "string") {
          errors.push("evidence_signal not string");
        } else if (!snapshot.signals || !(sig in snapshot.signals)) {
          errors.push(`evidence_signal ${sig} not in input_snapshot.signals`);
        }
      }
    }
  }

  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await exportDatasetToJsonl(args);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error("Unexpected failure.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
