import fs from "node:fs";
import path from "node:path";

import { scanObjectForForbidden } from "./lib/forbidden";
import {
  SnapshotV2,
  validateConclusionV2,
  validateEvidenceSignalsAgainstSnapshotV2,
} from "./lib/conclusion_schema_v2";
import { inferDecisionV2 } from "./lib/decision_infer_v2";
import { DEFAULT_DECISION_MODEL_ID } from "./lib/decision_layer_v2";

type Args = {
  input: string;
  model?: string;
  limit?: number;
  out?: string;
  patchQueue?: string;
  microRewriteDecision?: boolean;
};

const DEFAULTS: Args = {
  input: "ml_artifacts/valid_decision_v2.jsonl",
  patchQueue: "ml_artifacts/patch_queue.jsonl",
};

function parseBool(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  const normalized = value.toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  return defaultValue;
}

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
      case "--patch_queue":
        args.patchQueue = value;
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
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(text).digest("hex");
}

function appendPatchQueue(pathStr: string, record: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(pathStr), { recursive: true });
  fs.appendFileSync(pathStr, `${JSON.stringify(record)}\n`);
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

  const useMicroRewrite = Boolean(args.microRewriteDecision);

  let total = 0;
  let schemaFail = 0;
  let groundingFail = 0;
  let forbiddenFail = 0;
  let decisionVerbFail = 0;
  let decisionTimeFail = 0;
  let decisionVerbFailAfter = 0;
  let decisionTimeFailAfter = 0;
  let boundaryFail = 0;
  let seasonFail = 0;
  let rewriteTriggerCount = 0;
  let fallbackTriggerCount = 0;
  let decisionRewriteUsed = 0;
  let decisionRewriteApplied = 0;
  let decisionRewriteFailed = 0;
  let decisionRewriteTriggered = 0;
  let decisionRewriteChangedText = 0;

  const rows: any[] = [];

  for (let i = 0; i < limit; i += 1) {
    const snapshot = extractSnapshotFromJsonl(lines[i]);
    if (!snapshot) continue;

  let parsed: any = null;
  let raw = "";
  let decisionBefore = "";
  let decisionAfter = "";

    const result = await inferDecisionV2(snapshot, {
      model,
      micro_rewrite_decision: useMicroRewrite,
      patch_queue_path: "",
    });
    parsed = result.conclusion;
    decisionBefore = result.decision_before ?? parsed.decision;
    decisionAfter = result.decision_after ?? parsed.decision;
    if (result.micro_rewrite_triggered) decisionRewriteTriggered += 1;
    if (result.micro_rewrite_attempted) decisionRewriteUsed += 1;
    if (result.micro_rewrite_applied) decisionRewriteApplied += 1;
    if (result.micro_rewrite_failed) decisionRewriteFailed += 1;
    if (result.micro_rewrite_changed_text) decisionRewriteChangedText += 1;
    total += 1;

    if (!parsed) {
      schemaFail += 1;
      groundingFail += 1;
      forbiddenFail += 1;
      decisionVerbFail += 1;
      decisionTimeFail += 1;
      boundaryFail += 1;
      seasonFail += 1;
      rewriteTriggerCount += 1;
      fallbackTriggerCount += 1;
      appendPatchQueue(args.patchQueue!, {
        ts: new Date().toISOString(),
        model,
        example_id: sha256(stableStringify(snapshot)),
        snapshot,
        output_raw: raw,
        checks_failed: [
          "schema",
          "grounding",
          "forbidden",
          "decision_verb",
          "decision_timebox",
          "boundary_format",
          "season_context",
        ],
        expected_decision_pattern: "<verb> ... within <timebox>",
        expected_boundary_pattern: "If ...",
      });
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

    if (!decisionStartsWithVerb(decisionBefore)) decisionVerbFail += 1;
    if (!decisionTimeBoxed(decisionBefore)) decisionTimeFail += 1;
    if (!decisionStartsWithVerb(decisionAfter)) decisionVerbFailAfter += 1;
    if (!decisionTimeBoxed(decisionAfter)) decisionTimeFailAfter += 1;
    if (!boundaryStartsWithIf(parsed.boundary)) boundaryFail += 1;
    if (!seasonContextOk(parsed.season_context)) seasonFail += 1;

    const checksFailed: string[] = [];
    if (!schema.ok) checksFailed.push("schema");
    if (!grounding.ok) checksFailed.push("grounding");
    if (forbidden.terms.length > 0) checksFailed.push("forbidden");
    if (!decisionStartsWithVerb(decisionBefore)) checksFailed.push("decision_verb");
    if (!decisionTimeBoxed(decisionBefore)) checksFailed.push("decision_timebox");
    if (!boundaryStartsWithIf(parsed.boundary)) checksFailed.push("boundary_format");
    if (!seasonContextOk(parsed.season_context)) checksFailed.push("season_context");

    if (checksFailed.length > 0) {
      rewriteTriggerCount += 1;
      appendPatchQueue(args.patchQueue!, {
        ts: new Date().toISOString(),
        model,
        example_id: sha256(stableStringify(snapshot)),
        snapshot,
        output_raw: raw,
        output_parsed: parsed,
        checks_failed: checksFailed,
        grounding_errors: grounding.ok ? [] : grounding.errors,
        forbidden_terms: forbidden.terms,
        expected_decision_pattern: "<verb> ... within <timebox>",
        expected_boundary_pattern: "If ...",
      });
    }

    rows.push({
      schema_ok: schema.ok,
      grounding_ok: grounding.ok,
      forbidden_terms: forbidden.terms,
      decision_starts_with_verb: decisionStartsWithVerb(decisionBefore),
      decision_timeboxed: decisionTimeBoxed(decisionBefore),
      decision_starts_with_verb_after: decisionStartsWithVerb(decisionAfter),
      decision_timeboxed_after: decisionTimeBoxed(decisionAfter),
      boundary_starts_with_if: boundaryStartsWithIf(parsed.boundary),
      season_context_ok: seasonContextOk(parsed.season_context),
    });
  }

  const passRate = (failCount: number) => (total ? (total - failCount) / total : 0);
  const failRate = (failCount: number) => (total ? failCount / total : 0);
  if (!useMicroRewrite) {
    decisionVerbFailAfter = decisionVerbFail;
    decisionTimeFailAfter = decisionTimeFail;
  }

  const summary = {
    total,
    schema_fail_rate: failRate(schemaFail),
    schema_pass_rate: passRate(schemaFail),
    schema_fails: `${schemaFail} / ${total}`,
    grounding_fail_rate: failRate(groundingFail),
    grounding_pass_rate: passRate(groundingFail),
    grounding_fails: `${groundingFail} / ${total}`,
    forbidden_fail_rate: failRate(forbiddenFail),
    forbidden_pass_rate: passRate(forbiddenFail),
    forbidden_fails: `${forbiddenFail} / ${total}`,
    decision_verb_fail_rate_raw: failRate(decisionVerbFail),
    decision_verb_pass_rate_raw: passRate(decisionVerbFail),
    decision_verb_fails_raw: `${decisionVerbFail} / ${total}`,
    decision_verb_fail_rate_after: failRate(decisionVerbFailAfter),
    decision_verb_pass_rate_after: passRate(decisionVerbFailAfter),
    decision_verb_fails_after: `${decisionVerbFailAfter} / ${total}`,
    decision_timebox_fail_rate_raw: failRate(decisionTimeFail),
    decision_timebox_pass_rate_raw: passRate(decisionTimeFail),
    decision_timebox_fails_raw: `${decisionTimeFail} / ${total}`,
    decision_timebox_fail_rate_after: failRate(decisionTimeFailAfter),
    decision_timebox_pass_rate_after: passRate(decisionTimeFailAfter),
    decision_timebox_fails_after: `${decisionTimeFailAfter} / ${total}`,
    boundary_fail_rate: failRate(boundaryFail),
    boundary_pass_rate: passRate(boundaryFail),
    boundary_fails: `${boundaryFail} / ${total}`,
    season_context_fail_rate: failRate(seasonFail),
    season_context_pass_rate: passRate(seasonFail),
    season_context_fails: `${seasonFail} / ${total}`,
    rewrite_trigger_rate: failRate(rewriteTriggerCount),
    rewrite_trigger_fails: `${rewriteTriggerCount} / ${total}`,
    fallback_trigger_rate: failRate(fallbackTriggerCount),
    fallback_trigger_fails: `${fallbackTriggerCount} / ${total}`,
    decision_rewrite_used: `${decisionRewriteUsed} / ${total}`,
    decision_rewrite_triggered: `${decisionRewriteTriggered} / ${total}`,
    decision_rewrite_applied: `${decisionRewriteApplied} / ${total}`,
    decision_rewrite_failed: `${decisionRewriteFailed} / ${total}`,
    decision_rewrite_changed_text: `${decisionRewriteChangedText} / ${total}`,
    notes: useMicroRewrite
      ? "after = post micro-rewrite when enabled; rewrite/fallback executed inside inferDecisionV2"
      : "micro-rewrite disabled; rewrite/fallback executed inside inferDecisionV2",
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
