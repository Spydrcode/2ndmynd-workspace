import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getStore } from "@/src/lib/intelligence/store";
import { DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";
import type { PredictiveContext } from "@/src/lib/intelligence/predictive/predictive_context";
import type { RunManifest } from "@/src/lib/intelligence/run_manifest";
import type { ArchetypeDetectionResult, ArchetypeWatchList } from "@/src/lib/intelligence/archetypes/types";
import { parseFlexibleTimestamp } from "./dates";

export type InputHealth = {
  date_range: string | null;
  records_count: number | null;
  coverage_warnings: string[];
};

export type InputSource = {
  label: string;
  count: number | null;
};

export type BusinessProfile = {
  name_guess?: string | null;
  summary?: string | null;
  services?: string[];
  industry_bucket?: string | null;
  location_mentions?: string[];
  domain?: string | null;
  found_contact?: boolean;
};

export type ConclusionV2 = {
  one_sentence_pattern?: string | null;
  decision?: string | null;
  why_this_now?: string | null;
  boundary?: string | null;
  confidence?: string | null;
  evidence_signals?: string[];
  optional_next_steps?: string[];
};

export type RunResults = {
  snapshot?: unknown;
  conclusion?: ConclusionV2 | null;
  validation?: { ok: boolean; errors?: string[] } | null;
  meta?: {
    run_id?: string;
    model_id?: string;
    primary_ok?: boolean;
  } | null;
  readiness_level?: "blocked" | "partial" | "ready" | null;
  diagnose_mode?: boolean | null;
  input_recognition?: {
    quotes_detected_count?: number;
    invoices_detected_count?: number;
    invoices_paid_detected_count?: number;
    reasons_dropped?: string[];
    files_attempted?: Array<{
      filename: string;
      type_guess: string;
      status: "success" | "error";
      error?: string;
    }>;
    by_type?: Record<string, unknown>;
  } | null;
  data_warnings?: string[];
  predictive_context?: PredictiveContext | null;
  archetypes?: ArchetypeDetectionResult | null;
  predictive_watch_list?: ArchetypeWatchList | null;
  layer_fusion?: unknown | null;
  benchmarks?: unknown | null;
  mapping_confidence?: "low" | "medium" | "high" | null;
  run_manifest?: RunManifest | null;
  artifacts?: {
    log_path?: string | null;
  } | null;
};

export type Run = {
  run_id: string;
  workspace_id?: string;
  pack_id?: string | null;
  created_at?: string | null;
  status?: string | null;
  mode?: string | null;
  input_hash?: string | null;
  website_url?: string | null;
  results_json?: RunResults | null;
  validation_json?: { ok: boolean; errors?: string[] } | null;
  input_health_json?: InputHealth | null;
  input_sources?: InputSource[] | null;
  business_profile_json?: BusinessProfile | null;
  error?: string | null;
};

export type ResultsArtifact = {
  run_id: string;
  created_at: string | null;
  business_profile: BusinessProfile | null;
  conclusion: ConclusionV2 | null;
  validation: { ok: boolean; errors?: string[] } | null;
  input_health: InputHealth | null;
  snapshot: unknown | null;
  input_recognition: RunResults["input_recognition"] | null;
  data_warnings: string[];
  readiness_level?: RunResults["readiness_level"] | null;
  diagnose_mode?: RunResults["diagnose_mode"] | null;
  predictive_context?: PredictiveContext | null;
  archetypes?: ArchetypeDetectionResult | null;
  predictive_watch_list?: ArchetypeWatchList | null;
  layer_fusion?: unknown | null;
  benchmarks?: unknown | null;
  mapping_confidence?: "low" | "medium" | "high" | null;
  decision_artifact?: unknown | null;
  run_manifest?: RunManifest | null;
};

function toDate(value?: string | null) {
  if (!value) return null;
  return parseFlexibleTimestamp(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function deriveDateRange(pack: DataPackV0 | null): string | null {
  if (!pack) return null;
  const dates: Date[] = [];
  const push = (value?: string | null) => {
    const date = toDate(value);
    if (date) dates.push(date);
  };
  pack.customers?.forEach((item) => push(item.created_at));
  pack.quotes?.forEach((item) => {
    push(item.created_at);
    push(item.approved_at);
  });
  pack.invoices?.forEach((item) => {
    push(item.issued_at);
    push(item.paid_at);
  });
  pack.jobs?.forEach((item) => {
    push(item.scheduled_at);
    push(item.completed_at);
  });
  if (!dates.length) return null;
  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  const start = sorted[0].toISOString().slice(0, 10);
  const end = sorted[sorted.length - 1].toISOString().slice(0, 10);
  return start === end ? start : `${start} - ${end}`;
}

function buildInputSources(pack: DataPackV0 | null): InputSource[] {
  if (!pack) return [];
  const sources: InputSource[] = [];
  if (pack.customers?.length) {
    sources.push({ label: "Customers", count: pack.customers.length });
  }
  if (pack.quotes?.length) {
    sources.push({ label: "Quotes", count: pack.quotes.length });
  }
  if (pack.invoices?.length) {
    sources.push({ label: "Invoices", count: pack.invoices.length });
  }
  if (pack.jobs?.length) {
    sources.push({ label: "Jobs", count: pack.jobs.length });
  }
  return sources;
}

function deriveInputHealth(pack: DataPackV0 | null, stats: unknown | null): InputHealth {
  const date_range = deriveDateRange(pack);
  const statsRecord = asRecord(stats);
  const records_count = typeof statsRecord.rows === "number" ? (statsRecord.rows as number) : null;
  const coverage_warnings = Array.isArray(statsRecord.warnings)
    ? (statsRecord.warnings.filter((w) => typeof w === "string") as string[])
    : [];
  if (!date_range && records_count === null && coverage_warnings.length === 0) {
    return {
      date_range: null,
      records_count: null,
      coverage_warnings: ["Input health not available yet."],
    };
  }
  return { date_range, records_count, coverage_warnings };
}

function normalizeRun(run: unknown): Run {
  const record = asRecord(run);
  const results = (record.results_json ?? null) as RunResults | null;
  const validation = (record.validation_json ?? results?.validation ?? null) as
    | { ok: boolean; errors?: string[] }
    | null;
  return {
    ...(record as unknown as Run),
    results_json: results,
    validation_json: validation,
    created_at: (record.created_at as string | null | undefined) ?? null,
  } as Run;
}

export async function getRun(run_id: string): Promise<Run | null> {
  const authDisabled = process.env.AUTH_DISABLED !== "0";
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const actor = user
    ? { id: user.id, email: user.email }
    : { id: "local-dev-user", email: null };

  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser(actor.id, actor.email);
  const run = await store.getRun(run_id);
  if (!run) return null;
  if (!authDisabled && run.workspace_id !== workspace.id) return null;

  const pack = run.pack_id ? await store.getDataPack(run.pack_id) : null;
  const packData = (pack?.normalized_json ?? null) as DataPackV0 | null;
  const stats = pack?.stats_json ?? null;

  const runRecord = asRecord(run);
  const inputHealthFromRun = runRecord.input_health_json;
  const input_health_json =
    (inputHealthFromRun as InputHealth | null | undefined) ?? deriveInputHealth(packData, stats);
  const input_sources = buildInputSources(packData);

  return {
    ...normalizeRun(run),
    input_health_json,
    input_sources,
  };
}

export async function listRuns(): Promise<Run[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const actor = user
    ? { id: user.id, email: user.email }
    : { id: "local-dev-user", email: null };

  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser(actor.id, actor.email);
  const runs = await store.listRuns(workspace.id);
  return runs.map((run) => normalizeRun(run));
}

export function buildResultsArtifact(run: Run): ResultsArtifact {
  return {
    run_id: run.run_id,
    created_at: run.created_at ?? null,
    business_profile: run.business_profile_json ?? null,
    conclusion: run.results_json?.conclusion ?? null,
    validation: run.validation_json ?? run.results_json?.validation ?? null,
    input_health: run.input_health_json ?? null,
    snapshot: run.results_json?.snapshot ?? null,
    input_recognition: run.results_json?.input_recognition ?? null,
    archetypes: run.results_json?.archetypes ?? null,
    predictive_watch_list: run.results_json?.predictive_watch_list ?? null,
    data_warnings: Array.isArray(run.results_json?.data_warnings) ? (run.results_json?.data_warnings as string[]) : [],
    readiness_level: (run.results_json?.readiness_level as RunResults["readiness_level"]) ?? null,
    diagnose_mode: (run.results_json?.diagnose_mode as RunResults["diagnose_mode"]) ?? null,
    predictive_context: run.results_json?.predictive_context ?? null,
    run_manifest: run.results_json?.run_manifest ?? null,
    layer_fusion: run.results_json?.layer_fusion ?? null,
    benchmarks: run.results_json?.benchmarks ?? null,
    mapping_confidence: run.results_json?.mapping_confidence ?? null,
    decision_artifact: run.results_json?.decision_artifact ?? null,
  };
}
