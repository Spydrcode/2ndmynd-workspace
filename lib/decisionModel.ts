import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

type DecisionErrorCode =
  | "INVALID_INPUT"
  | "MODEL_OUTPUT_INVALID"
  | "FORBIDDEN_TERMS"
  | "NO_ACTIVE_MODEL"
  | "OPENAI_ERROR"
  | "GROUNDING_FAILED";

export type ConclusionConfidence = "low" | "medium" | "high";

export type ConclusionV1 = {
  conclusion_version: "conclusion_v1";
  pattern_id: string;
  one_sentence_pattern: string;
  decision: string;
  boundary: string;
  why_this_now: string;
  confidence: ConclusionConfidence;
  evidence_signals: string[];
};

const FORBIDDEN_TERMS = [
  "dashboard",
  "kpi",
  "analytics",
  "monitor",
  "monitoring",
  "bi",
  "performance tracking",
  "reporting",
];

const REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /performance tracking/gi, replacement: "ongoing measurement" },
  { pattern: /dashboard/gi, replacement: "summary view" },
  { pattern: /kpi/gi, replacement: "signal" },
  { pattern: /analytics/gi, replacement: "patterns" },
  { pattern: /monitoring/gi, replacement: "watching" },
  { pattern: /monitor/gi, replacement: "watch" },
  { pattern: /\bbi\b/gi, replacement: "business tools" },
  { pattern: /reporting/gi, replacement: "summary" },
];

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateConclusion(obj: unknown) {
  const errors: string[] = [];
  if (!obj || typeof obj !== "object") {
    return { ok: false, errors: ["output must be an object"] };
  }
  const candidate = obj as Partial<ConclusionV1>;
  if (candidate.conclusion_version !== "conclusion_v1") {
    errors.push("conclusion_version must equal conclusion_v1");
  }
  if (!isNonEmptyString(candidate.pattern_id)) {
    errors.push("pattern_id must be a non-empty string");
  }
  if (!isNonEmptyString(candidate.one_sentence_pattern)) {
    errors.push("one_sentence_pattern must be a non-empty string");
  }
  if (!isNonEmptyString(candidate.decision)) {
    errors.push("decision must be a non-empty string");
  }
  if (!isNonEmptyString(candidate.boundary)) {
    errors.push("boundary must be a non-empty string");
  }
  if (!isNonEmptyString(candidate.why_this_now)) {
    errors.push("why_this_now must be a non-empty string");
  }
  if (
    candidate.confidence !== "low" &&
    candidate.confidence !== "medium" &&
    candidate.confidence !== "high"
  ) {
    errors.push("confidence must be low, medium, or high");
  }
  if (!Array.isArray(candidate.evidence_signals)) {
    errors.push("evidence_signals must be an array");
  } else {
    if (candidate.evidence_signals.length < 3 || candidate.evidence_signals.length > 6) {
      errors.push("evidence_signals must have 3 to 6 items");
    }
    for (const item of candidate.evidence_signals) {
      if (!isNonEmptyString(item)) {
        errors.push("evidence_signals items must be non-empty strings");
        break;
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function matchesTerm(normalized: string, term: string) {
  if (term === "bi") {
    return /\bbi\b/i.test(normalized);
  }
  if (term === "kpi") {
    return /\bkpi\b/i.test(normalized);
  }
  return normalized.includes(term);
}

function scanValue(value: unknown, path: string[], hits: Map<string, Set<string>>) {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    for (const term of FORBIDDEN_TERMS) {
      if (matchesTerm(normalized, term)) {
        if (!hits.has(term)) hits.set(term, new Set());
        hits.get(term)!.add(path.join("."));
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanValue(item, [...path, String(index)], hits);
    });
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, val]) => {
      scanValue(val, [...path, key], hits);
    });
  }
}

function scanObjectForForbidden(obj: unknown) {
  const hits = new Map<string, Set<string>>();
  scanValue(obj, [], hits);
  const terms = Array.from(hits.keys());
  const fields = Array.from(hits.values()).flatMap((set) => Array.from(set));
  return { terms, fields };
}

function rewriteString(value: string) {
  let updated = value;
  let changed = false;
  for (const { pattern, replacement } of REPLACEMENTS) {
    const next = updated.replace(pattern, replacement);
    if (next !== updated) {
      updated = next;
      changed = true;
    }
  }
  return { value: updated, changed };
}

function rewriteValue(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    return rewriteString(value);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const rewritten = value.map((item) => {
      const next = rewriteValue(item);
      if (next.changed) changed = true;
      return next.value;
    });
    return { value: rewritten, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const rewritten: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const next = rewriteValue(val);
      if (next.changed) changed = true;
      rewritten[key] = next.value;
    }
    return { value: rewritten, changed };
  }
  return { value, changed: false };
}

function rewriteConclusion(obj: unknown) {
  const rewritten = rewriteValue(obj);
  return { rewritten: rewritten.value, changed: rewritten.changed };
}

type SnapshotSignalRoot = Record<string, unknown>;

function getSignalRoot(snapshot: unknown): SnapshotSignalRoot | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const candidate = snapshot as {
    signals_flat?: unknown;
    signals?: unknown;
  };
  if (candidate.signals_flat && typeof candidate.signals_flat === "object") {
    return candidate.signals_flat as SnapshotSignalRoot;
  }
  if (candidate.signals && typeof candidate.signals === "object") {
    return candidate.signals as SnapshotSignalRoot;
  }
  return null;
}

function validateGrounding(conclusion: ConclusionV1, snapshot: unknown) {
  const errors: string[] = [];
  const signals = getSignalRoot(snapshot);
  if (!signals) {
    return { ok: false, errors: ["snapshot.signals is missing"], missing: [] as string[] };
  }

  const missing: string[] = [];
  for (const key of conclusion.evidence_signals ?? []) {
    if (!(key in signals)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    errors.push(`missing evidence keys: ${missing.join(", ")}`);
  }

  return { ok: errors.length === 0, errors, missing };
}

function isValidSnapshot(inputSnapshot: unknown) {
  if (!inputSnapshot || typeof inputSnapshot !== "object") return false;
  const candidate = inputSnapshot as { snapshot_version?: unknown; signals?: unknown };
  if (!isNonEmptyString(candidate.snapshot_version)) return false;
  if (!candidate.signals || typeof candidate.signals !== "object") return false;
  return true;
}

async function getActiveModel(supabase: SupabaseClientAny) {
  const { data: modelRow, error } = await supabase
    .schema("ml")
    .from("model_registry")
    .select("model_id")
    .eq("name", "decision_model")
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return null;
  }

  return modelRow?.model_id ?? null;
}

async function getLatestModel(supabase: SupabaseClientAny) {
  const { data: latestRun, error: runError } = await supabase
    .schema("ml")
    .from("runs")
    .select("result_model")
    .eq("run_type", "finetune")
    .eq("run_status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError || !latestRun?.result_model) {
    throw new Error("No succeeded finetune model found.");
  }

  return latestRun.result_model as string;
}

async function resolveModel(supabase: SupabaseClientAny) {
  if (process.env.DECISION_MODEL_ID) {
    return process.env.DECISION_MODEL_ID;
  }
  const active = await getActiveModel(supabase);
  if (active) return active;
  return getLatestModel(supabase);
}

export async function getDecisionConclusion(inputSnapshot: unknown): Promise<
  | { ok: true; conclusion: ConclusionV1; model: string }
  | { ok: false; code: DecisionErrorCode; message: string }
> {
  if (!isValidSnapshot(inputSnapshot)) {
    return { ok: false, code: "INVALID_INPUT", message: "input snapshot shape invalid" };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, code: "OPENAI_ERROR", message: "missing OPENAI_API_KEY" };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, code: "OPENAI_ERROR", message: "missing Supabase env vars" };
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  let modelId = "";

  try {
    modelId = await resolveModel(supabase);
  } catch {
    return {
      ok: false,
      code: "NO_ACTIVE_MODEL",
      message:
        "No active finetune model found. Set DECISION_MODEL_ID or run ml:set-active-model.",
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const system =
    "You are an internal 2ndmynd decision model. Your job is to reduce owner decision burden by identifying one pattern, one decision, and one boundary. Avoid dashboards, KPIs, monitoring, or performance language.";

  const runAttempt = async (extraSystem?: string) => {
    const messages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: system },
    ];
    if (extraSystem) {
      messages.push({ role: "system", content: extraSystem });
    }
    messages.push({ role: "user", content: JSON.stringify(inputSnapshot) });
    const completion = await client.chat.completions.create({
      model: modelId,
      messages,
    });
    return completion.choices?.[0]?.message?.content ?? "";
  };

  const validateOutput = (raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        code: "MODEL_OUTPUT_INVALID",
        message: "model output is not valid JSON",
      } as const;
    }

    let schema = validateConclusion(parsed);
    let forbidden = scanObjectForForbidden(parsed);
    if (forbidden.terms.length > 0) {
      const rewrite = rewriteConclusion(parsed);
      parsed = rewrite.rewritten;
      schema = validateConclusion(parsed);
      forbidden = scanObjectForForbidden(parsed);
    }

    if (!schema.ok) {
      return {
        ok: false,
        code: "MODEL_OUTPUT_INVALID",
        message: schema.errors.join("; "),
      } as const;
    }

    const grounding = validateGrounding(parsed as ConclusionV1, inputSnapshot);
    if (!grounding.ok) {
      return {
        ok: false,
        code: "GROUNDING_FAILED",
        message: "Model did not ground evidence_signals.",
      } as const;
    }

    if (forbidden.terms.length > 0) {
      return {
        ok: false,
        code: "FORBIDDEN_TERMS",
        message: `forbidden terms: ${forbidden.terms.join(", ")}`,
      } as const;
    }

    return { ok: true, conclusion: parsed as ConclusionV1 } as const;
  };

  let content = "";
  try {
    content = await runAttempt();
  } catch (error) {
    return {
      ok: false,
      code: "OPENAI_ERROR",
      message: error instanceof Error ? error.message : "openai request failed",
    };
  }

  let validated = validateOutput(content);
  if (!validated.ok) {
    try {
      content = await runAttempt(
        "Pick 3-6 evidence_signals that are present in input_snapshot.signals keys. Do not invent keys. Return ONLY valid JSON."
      );
    } catch (error) {
      return {
        ok: false,
        code: "OPENAI_ERROR",
        message: error instanceof Error ? error.message : "openai request failed",
      };
    }
    validated = validateOutput(content);
  }

  if (!validated.ok) {
    return { ok: false, code: validated.code, message: validated.message };
  }

  return { ok: true, conclusion: validated.conclusion, model: modelId };
}
type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown> }>;
  };
  ml: {
    Tables: Record<string, { Row: Record<string, unknown> }>;
  };
};

type SupabaseClientAny = ReturnType<typeof createClient<Database>>;
