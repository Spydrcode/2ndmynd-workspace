import crypto from "node:crypto";
import OpenAI from "openai";

import { getIntelligenceConfig } from "../../intelligence/intelligence_config";
import { RunLogger } from "../../intelligence/run_logger";
import { scanObjectForForbidden } from "../forbidden";
import {
  SnapshotV2,
  ConclusionV2,
  validateConclusionV2,
  validateEvidenceSignalsAgainstSnapshotV2,
  listEvidenceLeafCandidates,
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
  decision_patch_applied: boolean;
  decision_patch_reason: "verb" | "timebox" | "both" | null;
  decision_original?: string;
  primary_raw?: string;
  rewrite_raw?: string;
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
  grounding_errors_raw?: string[];
  forbidden_terms: string[];
  season_warnings: string[];
};

type CallResult = {
  raw: string;
  parsed: ConclusionV2 | null;
};

type InferDecisionV2Options = {
  model?: string;
  micro_rewrite_decision?: boolean;
  patch_queue_path?: string;
  run_id?: string;
  logger?: RunLogger;
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

function buildMockConclusion(snapshot: SnapshotV2, seed: number): ConclusionV2 {
  const seedPayload = `${seed}:${stableStringify(snapshot)}`;
  const patternHash = sha256(seedPayload).slice(0, 12);

  return {
    conclusion_version: "conclusion_v2",
    pattern_id: `mock_${patternHash}`,
    one_sentence_pattern: "Quote follow-up timing is drifting relative to recent invoice activity.",
    decision: "Within 7 days: Review quote follow-up timing and assign a follow-up owner.",
    why_this_now: `Recent signals show ${snapshot.activity_signals.quotes.quotes_count} quotes and ${snapshot.activity_signals.invoices.invoices_count} invoices with ${snapshot.volatility_band} volatility.`,
    boundary:
      "If approval rates remain below target or decision lag stays elevated, confirm mappings before taking action.",
    confidence: snapshot.window?.sample_confidence ?? "medium",
    evidence_signals: deterministicEvidencePatch(snapshot),
    season_context: `Season phase is ${snapshot.season.phase} with ${snapshot.season.strength} strength and ${snapshot.season.predictability} predictability.`,
    optional_next_steps: ["verify input data", "review follow-up cadence"],
  };
}

async function callModel(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPayload: unknown,
  options?: { temperature?: number; top_p?: number }
): Promise<CallResult> {
  const temperature = typeof options?.temperature === "number" ? options.temperature : 0;
  const top_p = typeof options?.top_p === "number" ? options.top_p : 0.1;
  const resp = await client.responses.create({
    model,
    temperature,
    top_p,
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
        schema: CONCLUSION_V2_SCHEMA as Record<string, unknown>,
      },
    },
  });

  const raw = (resp as { output_text?: string }).output_text ?? "";
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
  let text = decision.trim();
  text = text.replace(
    /^within\s+\d+\s*(minutes?|hours?|days?|weeks?)\s*[:\-–]\s*/i,
    ""
  );
  text = text.replace(/^within\s+\d+\s*(minutes?|hours?|days?|weeks?)\s+/i, "");
  const first = text.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  const verbs = [
    "add",
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
    "followup",
    "confirm",
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

function boundaryStartsWithIf(boundary: string) {
  return boundary.trim().startsWith("If ");
}

function seasonContextOk(seasonContext: string) {
  return /\b(Rising|Active|Peak|Lower)\b/.test(seasonContext);
}

function normalizeDecisionText(decision: string) {
  let text = decision.trim().replace(/\s+/g, " ");
  text = text.replace(/^[\"'`]+|[\"'`]+$/g, "");
  text = text.replace(/[.?!]+$/g, "");
  text = text.replace(
    /^within\s+\d+\s*(minutes?|hours?|days?|weeks?)\s*:?\s*/i,
    ""
  );
  text = text.replace(
    /^for\s+the\s+next\s+\d+\s*(minutes?|hours?|days?|weeks?)\s*:?\s*/i,
    ""
  );
  text = text.replace(/^by\s+end\s+of\s+day\s*:?\s*/i, "");
  text = text.replace(/^this\s+week\s*:?\s*/i, "");
  text = text.replace(/^today\s*:?\s*/i, "");

  const fillers = [
    /^(we|you|i)\s+(should|need to|need|must|can|could|may|might|will|would)\s+/i,
    /^should\s+/i,
    /^please\s+/i,
    /^let'?s\s+/i,
    /^it'?s\s+time\s+to\s+/i,
    /^try\s+to\s+/i,
    /^aim\s+to\s+/i,
    /^plan\s+to\s+/i,
    /^consider\s+(?:to\s+)?/i,
    /^investigate\s+(?:and\s+)?/i,
    /^analyze\s+(?:and\s+)?/i,
    /^look\s+into\s+(?:and\s+)?/i,
    /^need\s+to\s+/i,
    /^to\s+/i,
  ];

  let prev = "";
  while (text && text !== prev) {
    prev = text;
    for (const pattern of fillers) {
      text = text.replace(pattern, "").trim();
    }
  }

  return text.replace(/^[^a-zA-Z]+/, "").trim();
}

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function ensureImperativePhrase(value: string) {
  const text = value.trim();
  if (!text) {
    return "Update the highest-impact action based on recent signals";
  }
  if (decisionStartsWithVerb(text)) return text;
  const cleaned = text.replace(/^[^a-zA-Z]+/, "");
  if (decisionStartsWithVerb(cleaned)) return cleaned;
  return cleaned || text;
}

function deterministicDecisionPatch(decision: string) {
  if (decisionStartsWithVerb(decision) || decisionTimeBoxed(decision)) {
    return decision;
  }
  const normalized = normalizeDecisionText(decision);
  const phrase = ensureImperativePhrase(normalized);
  const lower = phrase.toLowerCase();
  const defaultAction = "the highest-impact action based on recent signals";

  if (lower === "follow up" || lower.startsWith("follow up ")) {
    const action = phrase.slice("follow up".length).trim() || defaultAction;
    return `Within 7 days: Follow up ${action}.`;
  }

  const first = phrase.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  const whitelist = ["assign", "review", "call", "update", "standardize", "schedule", "follow", "confirm", "add"];
  const verb = whitelist.includes(first) ? capitalizeFirst(first) : "Update";
  const action = whitelist.includes(first)
    ? phrase.split(/\s+/).slice(1).join(" ").trim()
    : phrase;
  const finalAction = action || defaultAction;
  return `Within 7 days: ${verb} ${finalAction}.`;
}

function deterministicEvidencePatch(snapshot: SnapshotV2) {
  const candidates = listEvidenceLeafCandidates(snapshot);
  const map = new Map<string, string>();
  for (const candidate of candidates) {
    map.set(candidate.path, candidate.value);
  }

  const selected: string[] = [];
  const used = new Set<string>();

  const pushPath = (path: string) => {
    const value = map.get(path);
    if (value === undefined) return;
    const entry = `${path}=${value}`;
    if (used.has(entry)) return;
    used.add(entry);
    selected.push(entry);
  };

  const pickPaymentLagBand = () => {
    const bands = ["very_high", "high", "medium", "low", "very_low"];
    for (const band of bands) {
      const path = `signals.invoices.payment_lag_band_distribution.${band}`;
      const value = map.get(path);
      if (value === undefined) continue;
      if (Number(value) > 0) {
        pushPath(path);
        return true;
      }
    }
    return false;
  };

  pushPath("signals.quotes.approval_rate_band");
  pushPath("signals.quotes.decision_lag_band");
  pushPath("signals.invoices.invoices_paid_count");
  pickPaymentLagBand();
  pushPath("signals.volatility_band");
  pushPath("signals.input_costs.0.change_30d_pct");

  if (selected.length < 3) {
    const fallbackPaths = [
      "signals.quotes.quotes_count",
      "signals.invoices.invoices_count",
      "signals.activity_signals.quotes.quotes_count",
      "signals.activity_signals.invoices.invoices_count",
      "signals.volatility_band",
    ];
    for (const path of fallbackPaths) {
      if (selected.length >= 3) break;
      pushPath(path);
    }
  }

  if (selected.length < 3) {
    for (const candidate of candidates) {
      if (selected.length >= 3) break;
      const entry = `${candidate.path}=${candidate.value}`;
      if (used.has(entry)) continue;
      used.add(entry);
      selected.push(entry);
    }
  }

  return selected.slice(0, 6);
}

function shouldApplyEvidencePatch(snapshot: SnapshotV2) {
  return snapshot.window?.sample_confidence !== "low";
}

export async function inferDecisionV2(
  snapshot: SnapshotV2,
  options?: InferDecisionV2Options
): Promise<InferDecisionV2Result> {
  const config = getIntelligenceConfig();
  const logger = options?.logger ?? (options?.run_id ? new RunLogger(options.run_id) : undefined);
  const startedAt = Date.now();
  logger?.logEvent("infer.start", { mode: config.mode });

  const model = options?.model ?? process.env.TEST_MODEL ?? DEFAULT_DECISION_MODEL_ID;

  if (config.mode === "mock") {
    let output = buildMockConclusion(snapshot, config.seed);
    let schema = validateConclusionV2(output);
    let grounding = validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals);
    let forbidden = scanObjectForForbidden(output);

    if (!grounding.ok) {
      output = {
        ...output,
        evidence_signals: deterministicEvidencePatch(snapshot),
      };
      grounding = validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals);
      forbidden = scanObjectForForbidden(output);
    }

    if (!schema.ok) {
      output = insufficientEvidenceFallback(snapshot);
      schema = validateConclusionV2(output);
      grounding = validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals);
      forbidden = scanObjectForForbidden(output);
    }

    const seasonAdjusted = applySeasonConfidence(output, snapshot);
    output = seasonAdjusted.output;

    const checks: DecisionChecks = {
      schema_ok: schema.ok,
      grounding_ok: grounding.ok,
      forbidden_ok: forbidden.terms.length === 0,
      boundary_ok: boundaryStartsWithIf(output.boundary),
      season_context_ok: seasonContextOk(output.season_context),
      decision_verb_ok: decisionStartsWithVerb(output.decision),
      decision_timebox_ok: decisionTimeBoxed(output.decision),
    };

    const decisionPatchEligible = !checks.decision_verb_ok && !checks.decision_timebox_ok;
    const decisionPatchReason: "verb" | "timebox" | "both" | null = decisionPatchEligible ? "both" : null;

    const decisionOriginal = output.decision;
    let decisionPatchApplied = false;
    const decisionBefore: string | undefined = output.decision;
    let decisionAfter: string | undefined = output.decision;

    if (decisionPatchEligible) {
      const patched = deterministicDecisionPatch(output.decision);
      if (patched !== output.decision) {
        output = {
          ...output,
          decision: patched,
        };
        decisionPatchApplied = true;
        decisionAfter = output.decision;
      }
    }

    const decisionAfterChecks = {
      decision_verb_ok: decisionStartsWithVerb(output.decision),
      decision_timebox_ok: decisionTimeBoxed(output.decision),
    };

    const result: InferDecisionV2Result = {
      conclusion: output,
      model_id: model,
      primary_ok: true,
      rewrite_used: false,
      fallback_used: false,
      decision_rewrite_used: false,
      decision_rewrite_applied: false,
      decision_rewrite_failed: false,
      decision_patch_applied: decisionPatchApplied,
      decision_patch_reason: decisionPatchReason,
      decision_original: decisionPatchApplied ? decisionOriginal : undefined,
      primary_raw: undefined,
      rewrite_raw: undefined,
      micro_rewrite_attempted: false,
      micro_rewrite_applied: false,
      micro_rewrite_failed: false,
      micro_rewrite_reason: null,
      micro_rewrite_triggered: false,
      micro_rewrite_changed_text: false,
      micro_rewrite_raw_json: undefined,
      micro_rewrite_triggered_reason: null,
      decision_before: decisionBefore,
      decision_after: decisionAfter,
      decision_after_checks: decisionAfterChecks,
      schema_errors: schema.ok ? [] : schema.errors,
      grounding_errors: grounding.ok ? [] : grounding.errors,
      grounding_errors_raw: grounding.errors,
      forbidden_terms: forbidden.terms,
      season_warnings: seasonAdjusted.warnings,
    };

    logger?.logDuration("infer.complete", startedAt, {
      mode: "mock",
      primary_ok: result.primary_ok,
    });

    return result;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const primary = await callModel(client, model, PRIMARY_SYSTEM_PROMPT_V2, snapshot, {
    temperature: config.temperature,
    top_p: config.top_p,
  });

  let output = primary.parsed;
  let schema = output ? validateConclusionV2(output) : { ok: false, errors: ["parse_failed"] };
  let grounding = output
    ? validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals)
    : { ok: false, errors: ["parse_failed"], missing: [] as string[] };
  let forbidden = output ? scanObjectForForbidden(output) : { terms: [], fields: [] };
  let rewriteUsed = false;
  let fallbackUsed = false;
  const decisionRewriteUsed = false;
  const decisionRewriteApplied = false;
  const decisionRewriteFailed = false;
  let rewriteRaw: string | undefined;
  let groundingErrorsRaw: string[] | undefined;

  if (!output || !schema.ok || !grounding.ok || forbidden.terms.length > 0) {
    rewriteUsed = true;
    const repaired = await callModel(
      client,
      model,
      REWRITE_SYSTEM_PROMPT_V2,
      { snapshot, bad_output: output ?? primary.raw },
      { temperature: config.temperature, top_p: config.top_p }
    );
    rewriteRaw = repaired.raw;
    output = repaired.parsed;
    schema = output ? validateConclusionV2(output) : { ok: false, errors: ["parse_failed"] };
    grounding = output
      ? validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals)
      : { ok: false, errors: ["parse_failed"], missing: [] as string[] };
    forbidden = output ? scanObjectForForbidden(output) : { terms: [], fields: [] };
  }

  if (
    output &&
    schema.ok &&
    forbidden.terms.length === 0 &&
    !grounding.ok &&
    shouldApplyEvidencePatch(snapshot)
  ) {
    output = {
      ...output,
      evidence_signals: deterministicEvidencePatch(snapshot),
    };
    grounding = validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals);
  }

  const totalSignals =
    (snapshot.activity_signals?.quotes?.quotes_count ?? 0) +
    (snapshot.activity_signals?.invoices?.invoices_count ?? 0);
  const lowSignalGuard =
    snapshot.window?.sample_confidence === "low" && totalSignals <= 3;

  if (lowSignalGuard) {
    groundingErrorsRaw = ["low_sample_confidence_guard"];
    fallbackUsed = true;
    output = insufficientEvidenceFallback(snapshot);
    schema = validateConclusionV2(output);
    grounding = validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals);
    forbidden = scanObjectForForbidden(output);
  }

  if (!output || !schema.ok || !grounding.ok || forbidden.terms.length > 0) {
    groundingErrorsRaw = grounding.errors;
    fallbackUsed = true;
    output = insufficientEvidenceFallback(snapshot);
    schema = validateConclusionV2(output);
    grounding = validateEvidenceSignalsAgainstSnapshotV2(snapshot, output.evidence_signals);
    forbidden = scanObjectForForbidden(output);
  }

  const seasonAdjusted = applySeasonConfidence(output, snapshot);
  output = seasonAdjusted.output;

  const checks: DecisionChecks = {
    schema_ok: schema.ok,
    grounding_ok: grounding.ok,
    forbidden_ok: forbidden.terms.length === 0,
    boundary_ok: boundaryStartsWithIf(output.boundary),
    season_context_ok: seasonContextOk(output.season_context),
    decision_verb_ok: decisionStartsWithVerb(output.decision),
    decision_timebox_ok: decisionTimeBoxed(output.decision),
  };

  const decisionPatchEligible = !checks.decision_verb_ok && !checks.decision_timebox_ok;
  const decisionPatchReason: "verb" | "timebox" | "both" | null = decisionPatchEligible ? "both" : null;

  const decisionOriginal = output.decision;
  let decisionPatchApplied = false;
  const decisionBefore: string | undefined = output.decision;
  let decisionAfter: string | undefined = output.decision;

  if (decisionPatchEligible) {
    const patched = deterministicDecisionPatch(output.decision);
    if (patched !== output.decision) {
      output = {
        ...output,
        decision: patched,
      };
      decisionPatchApplied = true;
      decisionAfter = output.decision;
    }
  }

  const decisionAfterChecks = {
    decision_verb_ok: decisionStartsWithVerb(output.decision),
    decision_timebox_ok: decisionTimeBoxed(output.decision),
  };

  const result: InferDecisionV2Result = {
    conclusion: output,
    model_id: model,
    primary_ok: Boolean(primary.parsed && schema.ok && grounding.ok && forbidden.terms.length === 0),
    rewrite_used: rewriteUsed,
    fallback_used: fallbackUsed,
    decision_rewrite_used: decisionRewriteUsed,
    decision_rewrite_applied: decisionRewriteApplied,
    decision_rewrite_failed: decisionRewriteFailed,
    decision_patch_applied: decisionPatchApplied,
    decision_patch_reason: decisionPatchReason,
    decision_original: decisionPatchApplied ? decisionOriginal : undefined,
    primary_raw: primary.raw || undefined,
    rewrite_raw: rewriteRaw,
    micro_rewrite_attempted: false,
    micro_rewrite_applied: false,
    micro_rewrite_failed: false,
    micro_rewrite_reason: null,
    micro_rewrite_triggered: false,
    micro_rewrite_changed_text: false,
    micro_rewrite_raw_json: undefined,
    micro_rewrite_triggered_reason: null,
    decision_before: decisionBefore,
    decision_after: decisionAfter,
    decision_after_checks: decisionAfterChecks,
    schema_errors: schema.ok ? [] : schema.errors,
    grounding_errors: grounding.ok ? [] : grounding.errors,
    grounding_errors_raw: groundingErrorsRaw,
    forbidden_terms: forbidden.terms,
    season_warnings: seasonAdjusted.warnings,
  };

  logger?.logDuration("infer.complete", startedAt, {
    mode: "live",
    primary_ok: result.primary_ok,
  });

  return result;
}
