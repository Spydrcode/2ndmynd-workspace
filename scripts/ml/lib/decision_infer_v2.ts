import OpenAI from "openai";

import { scanObjectForForbidden } from "./forbidden";
import {
  SnapshotV2,
  ConclusionV2,
  validateConclusionV2,
  validateEvidenceSignalsAgainstSnapshotV2,
  seasonSanityCheck,
} from "./conclusion_schema_v2";
import {
  DEFAULT_DECISION_MODEL_ID,
  PRIMARY_SYSTEM_PROMPT_V2,
  REWRITE_SYSTEM_PROMPT_V2,
  CONCLUSION_V2_SCHEMA,
} from "./decision_layer_v2";

export type InferDecisionV2Result = {
  conclusion: ConclusionV2;
  model_id: string;
  primary_ok: boolean;
  rewrite_used: boolean;
  fallback_used: boolean;
  decision_rewrite_used: boolean;
  decision_rewrite_applied: boolean;
  decision_rewrite_failed: boolean;
  micro_rewrite_attempted: boolean;
  micro_rewrite_applied: boolean;
  micro_rewrite_failed: boolean;
  micro_rewrite_reason: "decision_verb" | "decision_timebox" | "both" | null;
  micro_rewrite_triggered: boolean;
  micro_rewrite_changed_text: boolean;
  micro_rewrite_raw_json?: string;
  micro_rewrite_triggered_reason?: "decision_verb" | "decision_timebox" | "both" | null;
  decision_before?: string;
  decision_after?: string;
  decision_after_checks?: { decision_verb_ok: boolean; decision_timebox_ok: boolean };
  schema_errors: string[];
  grounding_errors: string[];
  forbidden_terms: string[];
  season_warnings: string[];
};

type CallResult = {
  raw: string;
  parsed: ConclusionV2 | null;
};

type DecisionRewriteResult = {
  raw: string;
  parsed: { decision: string; optional_next_steps: string[] } | null;
};

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
    season_context: `Season phase is ${snapshot.season.phase}.`,
    optional_next_steps: ["verify input data", "rerun after refresh"],
  };
}

async function callModel(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPayload: unknown
): Promise<CallResult> {
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

type DecisionChecks = {
  schema_ok: boolean;
  grounding_ok: boolean;
  forbidden_ok: boolean;
  boundary_ok: boolean;
  season_context_ok: boolean;
  decision_verb_ok: boolean;
  decision_timebox_ok: boolean;
};

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
    "order",
    "follow",
    "text",
    "email",
    "price",
    "compare",
  ];
  return verbs.includes(first);
}

function decisionTimeBoxed(decision: string) {
  const text = decision.toLowerCase();
  return (
    text.includes("within") ||
    text.includes("for the next") ||
    text.includes("today") ||
    text.includes("by end of day") ||
    text.includes("this week") ||
    text.includes("next") ||
    /\b\d+\s*(minutes?|hours?|days?|weeks?)\b/.test(text)
  );
}

function decisionContainsSentinel(decision: string) {
  const text = decision.toLowerCase();
  return text.includes("request_more_data") || text.includes("fix_mapping");
}

function boundaryStartsWithIf(boundary: string) {
  return boundary.trim().startsWith("If ");
}

function seasonContextOk(seasonContext: string) {
  return /\b(Rising|Active|Peak|Lower)\b/.test(seasonContext);
}

function needsDecisionMicroRewrite(checks: DecisionChecks, enabled: boolean) {
  return (
    enabled &&
    checks.schema_ok &&
    checks.grounding_ok &&
    checks.forbidden_ok &&
    checks.boundary_ok &&
    checks.season_context_ok &&
    (!checks.decision_verb_ok || !checks.decision_timebox_ok)
  );
}

async function applyDecisionMicroRewrite(params: {
  client: OpenAI;
  model: string;
  snapshot: SnapshotV2;
  conclusion: ConclusionV2;
  reason: "decision_verb" | "decision_timebox" | "both";
}): Promise<DecisionRewriteResult> {
  const decisionRewriteSchema = {
    type: "object",
    additionalProperties: false,
    required: ["decision", "optional_next_steps"],
    properties: {
      decision: { type: "string", minLength: 1 },
      optional_next_steps: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: { type: "string", minLength: 1 },
      },
    },
  } as const;

  const decisionRewriteSystem =
    "Rewrite ONLY the decision text to start with a verb and include a timebox. Do NOT add new facts.\n" +
    "Do NOT change evidence_signals, boundary, why_this_now, one_sentence_pattern, season_context, confidence.\n" +
    "Keep the decision executable in <30 minutes or within 7 days. Output only JSON.";

  const payload = {
    snapshot: params.snapshot,
    conclusion: params.conclusion,
    failing_checks: params.reason,
    expected_decision_pattern: "<verb> ... within <timebox>",
    expected_boundary_pattern: "If ...",
  };

  const resp = await params.client.responses.create({
    model: params.model,
    temperature: 0,
    top_p: 0.1,
    presence_penalty: 0,
    frequency_penalty: 0,
    input: [
      { role: "system", content: decisionRewriteSystem },
      { role: "user", content: JSON.stringify(payload) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "decision_rewrite",
        strict: true,
        schema: decisionRewriteSchema as any,
      },
    },
  });

  const raw = (resp as any).output_text as string;
  if (!raw) return { raw: "", parsed: null };
  try {
    const parsed = JSON.parse(raw) as { decision: string; optional_next_steps?: string[] };
    return {
      raw,
      parsed: {
        decision: parsed.decision,
        optional_next_steps: parsed.optional_next_steps ?? [],
      },
    };
  } catch {
    return { raw, parsed: null };
  }
}

function pickTimeboxFromBoundary(boundary: string) {
  const text = boundary.toLowerCase();
  if (text.includes("7 days")) return "within 7 days";
  if (text.includes("14 days")) return "this week";
  return "today";
}

function pickItemCount(snapshot: SnapshotV2) {
  const quotes = snapshot.activity_signals?.quotes?.quotes_count ?? 0;
  const invoices = snapshot.activity_signals?.invoices?.invoices_count ?? 0;
  const base = quotes > 0 ? quotes : invoices > 0 ? invoices : 10;
  return Math.min(10, Math.max(3, base));
}

function deterministicDecisionPatch(snapshot: SnapshotV2, boundary: string) {
  const timebox = pickTimeboxFromBoundary(boundary);
  const count = pickItemCount(snapshot);
  return `Review the last ${count} items and confirm the next step ${timebox}.`;
}

export async function inferDecisionV2(
  snapshot: SnapshotV2,
  options?: { model?: string; micro_rewrite_decision?: boolean; patch_queue_path?: string }
): Promise<InferDecisionV2Result> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }

  const model = options?.model ?? process.env.TEST_MODEL ?? DEFAULT_DECISION_MODEL_ID;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const primary = await callModel(client, model, PRIMARY_SYSTEM_PROMPT_V2, snapshot);

  let output = primary.parsed;
  let schema = output ? validateConclusionV2(output) : { ok: false, errors: ["parse_failed"] };
  let grounding = output
    ? validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals)
    : { ok: false, errors: ["parse_failed"], missing: [] as string[] };
  let forbidden = output ? scanObjectForForbidden(output) : { terms: [], fields: [] };
  let rewriteUsed = false;
  let fallbackUsed = false;
  let decisionRewriteUsed = false;
  let decisionRewriteApplied = false;
  let decisionRewriteFailed = false;
  let decisionRewriteRaw: string | undefined;

  if (!output || !schema.ok || !grounding.ok || forbidden.terms.length > 0) {
    rewriteUsed = true;
    const repaired = await callModel(
      client,
      model,
      REWRITE_SYSTEM_PROMPT_V2,
      { snapshot, bad_output: output ?? primary.raw }
    );
    output = repaired.parsed;
    schema = output ? validateConclusionV2(output) : { ok: false, errors: ["parse_failed"] };
    grounding = output
      ? validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals)
      : { ok: false, errors: ["parse_failed"], missing: [] as string[] };
    forbidden = output ? scanObjectForForbidden(output) : { terms: [], fields: [] };
  }

  if (!output || !schema.ok || !grounding.ok || forbidden.terms.length > 0) {
    fallbackUsed = true;
    output = insufficientEvidenceFallback(snapshot);
    schema = validateConclusionV2(output);
    grounding = validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals);
    forbidden = scanObjectForForbidden(output);
  }

  const seasonAdjusted = applySeasonConfidence(output, snapshot);
  output = seasonAdjusted.output;
  const envMicroRewrite =
    process.env.MICRO_REWRITE_DECISION === undefined
      ? undefined
      : process.env.MICRO_REWRITE_DECISION === "1";
  const microRewriteEnabled =
    envMicroRewrite ?? (options?.micro_rewrite_decision ?? true);

  const checks: DecisionChecks = {
    schema_ok: schema.ok,
    grounding_ok: grounding.ok,
    forbidden_ok: forbidden.terms.length === 0,
    boundary_ok: boundaryStartsWithIf(output.boundary),
    season_context_ok: seasonContextOk(output.season_context),
    decision_verb_ok: decisionStartsWithVerb(output.decision),
    decision_timebox_ok: decisionTimeBoxed(output.decision),
  };

  let decisionRewriteReason: InferDecisionV2Result["micro_rewrite_reason"] = null;
  if (!checks.decision_verb_ok && !checks.decision_timebox_ok) {
    decisionRewriteReason = "both";
  } else if (!checks.decision_verb_ok) {
    decisionRewriteReason = "decision_verb";
  } else if (!checks.decision_timebox_ok) {
    decisionRewriteReason = "decision_timebox";
  }

  let decisionBefore: string | undefined = output.decision;
  let decisionAfter: string | undefined = output.decision;
  let decisionAfterChecks = {
    decision_verb_ok: checks.decision_verb_ok,
    decision_timebox_ok: checks.decision_timebox_ok,
  };
  let decisionRewriteTriggered = false;

  if (needsDecisionMicroRewrite(checks, microRewriteEnabled) && decisionRewriteReason) {
    decisionRewriteUsed = true;
    decisionRewriteTriggered = true;
    const rewritten = await applyDecisionMicroRewrite({
      client,
      model,
      snapshot,
      conclusion: output,
      reason: decisionRewriteReason,
    });
    decisionRewriteRaw = rewritten.raw;

    if (rewritten.parsed) {
      const candidate = rewritten.parsed;
      if (
        decisionStartsWithVerb(candidate.decision) &&
        decisionTimeBoxed(candidate.decision) &&
        scanObjectForForbidden(candidate).terms.length === 0
      ) {
        output = {
          ...output,
          decision: candidate.decision,
          optional_next_steps:
            candidate.optional_next_steps.length > 0
              ? candidate.optional_next_steps
              : output.optional_next_steps ?? [],
        };
        decisionRewriteApplied = true;
        decisionAfter = output.decision;
      } else {
        decisionRewriteFailed = true;
      }
    } else {
      decisionRewriteFailed = true;
    }

    const postDecision = output.decision;
    const postVerbOk = decisionStartsWithVerb(postDecision);
    const postTimeboxOk = decisionTimeBoxed(postDecision);
    const sentinel = decisionContainsSentinel(postDecision);

    if (!postVerbOk || !postTimeboxOk || sentinel) {
      output = {
        ...output,
        decision: deterministicDecisionPatch(snapshot, output.boundary),
      };
      decisionAfter = output.decision;
    }

    decisionAfterChecks = {
      decision_verb_ok: decisionStartsWithVerb(output.decision),
      decision_timebox_ok: decisionTimeBoxed(output.decision),
    };
  }

  if (decisionRewriteFailed) {
    const patchPath =
      options?.patch_queue_path ?? process.env.PATCH_QUEUE_PATH ?? "";
    if (patchPath) {
      const record = {
        ts: new Date().toISOString(),
        model,
        snapshot,
        output_raw: output,
        checks_failed: [
          ...(checks.schema_ok ? [] : ["schema"]),
          ...(checks.grounding_ok ? [] : ["grounding"]),
          ...(checks.forbidden_ok ? [] : ["forbidden"]),
          ...(checks.boundary_ok ? [] : ["boundary_format"]),
          ...(checks.season_context_ok ? [] : ["season_context"]),
          ...(!checks.decision_verb_ok ? ["decision_verb"] : []),
          ...(!checks.decision_timebox_ok ? ["decision_timebox"] : []),
        ],
        expected_decision_pattern: "<verb> ... within <timebox>",
        expected_boundary_pattern: "If ...",
        micro_rewrite_failed: true,
      };
      const fs = require("node:fs");
      const path = require("node:path");
      fs.mkdirSync(path.dirname(patchPath), { recursive: true });
      fs.appendFileSync(patchPath, `${JSON.stringify(record)}\n`);
    }
  }

  return {
    conclusion: output,
    model_id: model,
    primary_ok: Boolean(primary.parsed && schema.ok && grounding.ok && forbidden.terms.length === 0),
    rewrite_used: rewriteUsed,
    fallback_used: fallbackUsed,
    decision_rewrite_used: decisionRewriteUsed,
    decision_rewrite_applied: decisionRewriteApplied,
    decision_rewrite_failed: decisionRewriteFailed,
    micro_rewrite_attempted: decisionRewriteUsed,
    micro_rewrite_applied: decisionRewriteApplied,
    micro_rewrite_failed: decisionRewriteFailed,
    micro_rewrite_reason: decisionRewriteReason,
    micro_rewrite_triggered: decisionRewriteTriggered,
    micro_rewrite_changed_text: Boolean(decisionBefore && decisionAfter && decisionBefore !== decisionAfter),
    micro_rewrite_raw_json: decisionRewriteRaw,
    micro_rewrite_triggered_reason: decisionRewriteReason,
    decision_before: decisionBefore,
    decision_after: decisionAfter,
    decision_after_checks: decisionAfterChecks,
    schema_errors: schema.ok ? [] : schema.errors,
    grounding_errors: grounding.ok ? [] : grounding.errors,
    forbidden_terms: forbidden.terms,
    season_warnings: seasonAdjusted.warnings,
  };
}
