import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import OpenAI from "openai";

import { scanObjectForForbidden } from "./lib/forbidden";
import {
  SnapshotV2,
  ConclusionV2,
  validateConclusionV2,
  validateEvidenceSignalsAgainstSnapshotV2,
  seasonSanityCheck,
} from "./lib/conclusion_schema_v2";
import {
  DEFAULT_DECISION_MODEL_ID,
  PRIMARY_SYSTEM_PROMPT_V2,
  REWRITE_SYSTEM_PROMPT_V2,
  CONCLUSION_V2_SCHEMA,
} from "./lib/decision_layer_v2";

type Args = {
  model?: string;
  inputPath?: string;
  json?: string;
};

const REQUIRED_KEYS = [
  "conclusion_version",
  "pattern_id",
  "one_sentence_pattern",
  "decision",
  "why_this_now",
  "boundary",
  "confidence",
  "evidence_signals",
  "season_context",
];

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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(",")}}`;
}

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function insufficientEvidenceFallback(snapshot: SnapshotV2): ConclusionV2 {
  return {
    conclusion_version: "conclusion_v2",
    pattern_id: `insufficient_evidence_${sha256(stableStringify(snapshot)).slice(0, 12)}`,
    one_sentence_pattern:
      "Not enough grounded leaf signals were available to generate a reliable conclusion.",
    decision: "request_more_data_or_fix_mapping",
    why_this_now:
      "The system could not produce 3-6 grounded evidence_signals that match leaf fields in the snapshot. This usually indicates missing/incorrect mapping or sparse data.",
    boundary: "If counts remain zero or mappings are missing, fix the data inputs and rerun.",
    confidence: "low",
    evidence_signals: [
      `signals.activity_signals.quotes.quotes_count=${snapshot.activity_signals.quotes.quotes_count}`,
      `signals.activity_signals.invoices.invoices_count=${snapshot.activity_signals.invoices.invoices_count}`,
      `signals.volatility_band=${snapshot.volatility_band}`,
    ],
    season_context: `Season phase: ${snapshot.season.phase}.`,
    optional_next_steps: ["verify input data", "rerun after refresh"],
  };
}

async function callModel(
  client: OpenAI,
  model: string,
  snapshot: SnapshotV2,
  systemPrompt: string,
  userPayload: unknown
): Promise<{ raw: string; parsed: ConclusionV2 | null }> {
  const resp = await client.responses.create({
    model,
    temperature: 0,
    top_p: 0.1,
    presence_penalty: 0,
    frequency_penalty: 0,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "conclusion_v2",
        strict: true,
        schema: CONCLUSION_V2_SCHEMA as any,
      },
    },
  });

  const raw = (resp as any).output_text as string;
  if (!raw) return { raw: "", parsed: null };
  try {
    return { raw, parsed: JSON.parse(raw) as ConclusionV2 };
  } catch {
    return { raw, parsed: null };
  }
}

function applySeasonConfidence(
  output: ConclusionV2,
  snapshot: SnapshotV2
): { output: ConclusionV2; warnings: string[] } {
  const check = seasonSanityCheck(snapshot);
  if (check.ok) return { output, warnings: [] };

  const order = ["low", "medium", "high"] as const;
  const maxIdx = order.indexOf(check.max_confidence);
  const currentIdx = order.indexOf(output.confidence);
  const nextConfidence = currentIdx > maxIdx ? order[maxIdx] : output.confidence;

  if (nextConfidence === output.confidence) {
    return { output, warnings: check.warnings };
  }

  return {
    output: { ...output, confidence: nextConfidence },
    warnings: check.warnings,
  };
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

  const model = args.model ?? process.env.TEST_MODEL ?? DEFAULT_DECISION_MODEL_ID;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const primary = await callModel(
    client,
    model,
    inputSnapshot,
    PRIMARY_SYSTEM_PROMPT_V2,
    inputSnapshot
  );

  let output = primary.parsed;
  let grounding = output
    ? validateEvidenceSignalsAgainstSnapshotV2(inputSnapshot, output.evidence_signals)
    : { ok: false, errors: ["parse_failed"], missing: [] as string[] };
  let schema = output ? validateConclusionV2(output) : { ok: false, errors: ["parse_failed"] };
  let forbidden = output ? scanObjectForForbidden(output) : { terms: [], fields: [] };

  if (!output || !schema.ok || !grounding.ok || forbidden.terms.length > 0) {
    const repaired = await callModel(
      client,
      model,
      inputSnapshot,
      REWRITE_SYSTEM_PROMPT_V2,
      { snapshot: inputSnapshot, bad_output: output ?? primary.raw }
    );
    output = repaired.parsed;
    schema = output ? validateConclusionV2(output) : { ok: false, errors: ["parse_failed"] };
    grounding = output
      ? validateEvidenceSignalsAgainstSnapshotV2(inputSnapshot, output.evidence_signals)
      : { ok: false, errors: ["parse_failed"], missing: [] as string[] };
    forbidden = output ? scanObjectForForbidden(output) : { terms: [], fields: [] };
  }

  if (!output || !schema.ok || !grounding.ok || forbidden.terms.length > 0) {
    output = insufficientEvidenceFallback(inputSnapshot);
    schema = validateConclusionV2(output);
    grounding = validateEvidenceSignalsAgainstSnapshotV2(inputSnapshot, output.evidence_signals);
  }

  const seasonAdjusted = applySeasonConfidence(output, inputSnapshot);
  if (seasonAdjusted.warnings.length > 0) {
    output = seasonAdjusted.output;
  }

  if (REQUIRED_KEYS.some((key) => !(key in output))) {
    console.error("Output missing required keys.");
    process.exit(1);
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
