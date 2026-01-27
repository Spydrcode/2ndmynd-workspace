import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";

import { scanObjectForForbidden } from "./lib/forbidden";
import {
  SnapshotV2,
  validateConclusionV2,
  validateEvidenceSignalsAgainstSnapshotV2,
} from "./lib/conclusion_schema_v2";
import {
  DEFAULT_DECISION_MODEL_ID,
  PRIMARY_SYSTEM_PROMPT_V2,
  CONCLUSION_V2_SCHEMA,
} from "./lib/decision_layer_v2";

type Args = {
  input: string;
  model?: string;
  limit?: number;
  out?: string;
};

const DEFAULTS: Args = {
  input: "ml_artifacts/valid_decision_v2.jsonl",
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) continue;
    switch (key) {
      case "--in":
        args.input = value;
        break;
      case "--model":
        args.model = value;
        break;
      case "--limit":
        args.limit = Number(value);
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
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY environment variable.");
    process.exit(1);
  }
}

function extractSnapshotFromJsonl(line: string): SnapshotV2 | null {
  try {
    const obj = JSON.parse(line);
    const user = obj?.messages?.find((m: any) => m.role === "user");
    if (!user?.content) return null;
    return JSON.parse(user.content) as SnapshotV2;
  } catch {
    return null;
  }
}

function decisionStartsWithVerb(decision: string) {
  const first = decision.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const verbs = [
    "assign",
    "review",
    "call",
    "triage",
    "standardize",
    "freeze",
    "update",
    "tighten",
    "set",
    "prioritize",
    "simplify",
    "require",
    "audit",
    "reduce",
    "pause",
    "focus",
    "schedule",
  ];
  return verbs.includes(first);
}

function decisionTimeBoxed(decision: string) {
  const text = decision.toLowerCase();
  return (
    text.includes("within") ||
    text.includes("for the next") ||
    text.includes("today") ||
    text.includes("this week") ||
    text.includes("next") ||
    /\b\d+\s*(minutes?|hours?|days?|weeks?)\b/.test(text)
  );
}

function boundaryStartsWithIf(boundary: string) {
  return boundary.trim().startsWith("If ");
}

function seasonContextOk(seasonContext: string) {
  return /\b(Rising|Active|Peak|Lower)\b/.test(seasonContext);
}

async function callModel(
  client: OpenAI,
  model: string,
  snapshot: SnapshotV2
) {
  const resp = await client.responses.create({
    model,
    temperature: 0,
    top_p: 0.1,
    presence_penalty: 0,
    frequency_penalty: 0,
    input: [
      { role: "system", content: PRIMARY_SYSTEM_PROMPT_V2 },
      { role: "user", content: JSON.stringify(snapshot) },
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
  if (!raw) return { parsed: null, raw: "" };
  try {
    return { parsed: JSON.parse(raw), raw };
  } catch {
    return { parsed: null, raw };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing input: ${inputPath}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean);
  const limit = args.limit ? Math.min(args.limit, lines.length) : lines.length;
  const model = args.model ?? process.env.TEST_MODEL ?? DEFAULT_DECISION_MODEL_ID;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let total = 0;
  let schemaFail = 0;
  let groundingFail = 0;
  let forbiddenFail = 0;
  let decisionVerbFail = 0;
  let decisionTimeFail = 0;
  let boundaryFail = 0;
  let seasonFail = 0;

  const rows: any[] = [];

  for (let i = 0; i < limit; i += 1) {
    const snapshot = extractSnapshotFromJsonl(lines[i]);
    if (!snapshot) continue;

    const { parsed } = await callModel(client, model, snapshot);
    total += 1;

    if (!parsed) {
      schemaFail += 1;
      groundingFail += 1;
      forbiddenFail += 1;
      decisionVerbFail += 1;
      decisionTimeFail += 1;
      boundaryFail += 1;
      seasonFail += 1;
      continue;
    }

    const schema = validateConclusionV2(parsed);
    if (!schema.ok) schemaFail += 1;

    const grounding = validateEvidenceSignalsAgainstSnapshotV2(
      snapshot,
      parsed.evidence_signals
    );
    if (!grounding.ok) groundingFail += 1;

    const forbidden = scanObjectForForbidden(parsed);
    if (forbidden.terms.length > 0) forbiddenFail += 1;

    if (!decisionStartsWithVerb(parsed.decision)) decisionVerbFail += 1;
    if (!decisionTimeBoxed(parsed.decision)) decisionTimeFail += 1;
    if (!boundaryStartsWithIf(parsed.boundary)) boundaryFail += 1;
    if (!seasonContextOk(parsed.season_context)) seasonFail += 1;

    rows.push({
      schema_ok: schema.ok,
      grounding_ok: grounding.ok,
      forbidden_terms: forbidden.terms,
      decision_starts_with_verb: decisionStartsWithVerb(parsed.decision),
      decision_timeboxed: decisionTimeBoxed(parsed.decision),
      boundary_starts_with_if: boundaryStartsWithIf(parsed.boundary),
      season_context_ok: seasonContextOk(parsed.season_context),
    });
  }

  const summary = {
    total,
    schema_fail_rate: total ? schemaFail / total : 0,
    grounding_fail_rate: total ? groundingFail / total : 0,
    forbidden_fail_rate: total ? forbiddenFail / total : 0,
    decision_verb_fail_rate: total ? decisionVerbFail / total : 0,
    decision_timebox_fail_rate: total ? decisionTimeFail / total : 0,
    boundary_fail_rate: total ? boundaryFail / total : 0,
    season_context_fail_rate: total ? seasonFail / total : 0,
  };

  console.log("Decision Layer v2 eval summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify({ summary, rows }, null, 2));
    console.log(`Wrote eval report to ${args.out}`);
  }
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
