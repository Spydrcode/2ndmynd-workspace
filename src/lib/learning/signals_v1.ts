/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { AnalysisResult } from "../intelligence/run_analysis";
import type { BoundaryClass, IndustryKey, LearningSource, SignalsV1Record, TrainingExampleV1, WindowRule } from "./types";

const STRING_KEYS = ["industry_key", "source", "window_rule"] as const;

export const SIGNALS_V1_KEYS = [
  "industry_key",
  "source",
  "window_rule",
  "window_days",
  "coverage_ratio",
  "mapping_confidence_level",
  "missingness_score",
  "quotes_count",
  "invoices_count",
  "paid_invoices_count",
  "calendar_events_count",
  "active_days_count",
  "quotes_per_active_day",
  "invoices_per_active_day",
  "paid_invoice_rate",
  "quote_to_invoice_rate",
  "has_quotes",
  "has_invoices",
  "has_calendar",
  "decision_lag_days_p50",
  "decision_lag_days_p90",
  "approved_to_scheduled_days_p50",
  "approved_to_scheduled_days_p90",
  "invoiced_to_paid_days_p50",
  "invoiced_to_paid_days_p90",
  "has_decision_lag",
  "has_approved_to_scheduled",
  "has_invoiced_to_paid",
  "invoice_total_sum_log",
  "invoice_total_p50_log",
  "invoice_total_p90_log",
  "top1_invoice_share",
  "top5_invoice_share",
  "gini_proxy",
  "mid_ticket_share",
  "has_amounts",
  "weekly_volume_mean",
  "weekly_volume_cv",
  "seasonality_strength",
  "weekend_share",
  "has_rhythm",
  "open_quotes_count",
  "open_quotes_share",
  "stale_quotes_share_14d",
  "has_open_quotes",
  "excluded_quotes_outside_window",
  "excluded_invoices_outside_window",
  "excluded_calendar_outside_window",
  "excluded_ratio",
  "duplicate_id_rate",
  "date_parse_error_rate",
] as const;

const NUMERIC_KEYS = SIGNALS_V1_KEYS.filter((key) => !STRING_KEYS.includes(key as (typeof STRING_KEYS)[number]));

const WINDOW_RULES: WindowRule[] = ["last_90_days", "cap_100_closed", "last_12_months", "custom"];
const SOURCES: LearningSource[] = ["mock", "real"];
const INDUSTRIES: IndustryKey[] = ["hvac", "plumbing", "electrical", "landscaping", "cleaning", "unknown"];

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ratio(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return clamp01(numerator / denominator);
}

function mapConfidenceLevel(value?: string | null) {
  if (value === "high") return 2;
  if (value === "medium") return 1;
  return 0;
}

function inferSourceFromManifest(manifest: AnalysisResult["run_manifest"]): LearningSource {
  const mode = manifest?.mode?.toLowerCase?.() ?? "";
  const workspace = manifest?.workspace_id?.toLowerCase?.() ?? "";
  if (mode.includes("mock") || mode.includes("test") || workspace.includes("mock") || workspace.includes("test")) {
    return "mock";
  }
  return "real";
}

function mapIndustryKey(text?: string | null): IndustryKey {
  const t = (text ?? "").toLowerCase();
  if (t.includes("hvac")) return "hvac";
  if (t.includes("plumb")) return "plumbing";
  if (t.includes("electric")) return "electrical";
  if (t.includes("landscap")) return "landscaping";
  if (t.includes("clean")) return "cleaning";
  return "unknown";
}

function getSnapshot(analysis: AnalysisResult): SnapshotV2 | null {
  const candidate = analysis.snapshot as SnapshotV2 | null;
  if (candidate && candidate.snapshot_version === "snapshot_v2") return candidate;
  return null;
}

function computeWindowDays(analysis: AnalysisResult, snapshot: SnapshotV2 | null) {
  if (snapshot?.window?.lookback_days) return snapshot.window.lookback_days;
  const window = analysis.decision_artifact?.window;
  if (window?.start_date && window?.end_date) {
    const start = new Date(window.start_date);
    const end = new Date(window.end_date);
    if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
      const diff = Math.max(0, (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      return Math.round(diff);
    }
  }
  return 0;
}

function computeCoverageRatio(analysis: AnalysisResult, snapshot: SnapshotV2 | null) {
  const byType = analysis.input_recognition?.by_type ?? {};
  const types = ["quotes", "invoices", "calendar"];
  let inWindow = 0;
  let parsed = 0;
  for (const key of types) {
    const entry = (byType as Record<string, any>)[key];
    if (!entry) continue;
    const rowsInWindow = toNumber(entry.rows_in_window);
    const rowsParsed = toNumber(entry.rows_parsed ?? entry.rows_total);
    if (rowsInWindow !== null && rowsParsed !== null && rowsParsed >= 0) {
      inWindow += rowsInWindow;
      parsed += rowsParsed;
    }
  }
  if (parsed > 0) return clamp01(inWindow / parsed);
  const confidence = snapshot?.window?.sample_confidence;
  if (confidence === "high") return 0.9;
  if (confidence === "medium") return 0.6;
  if (confidence === "low") return 0.3;
  return 1;
}

function computeDateParseErrorRate(analysis: AnalysisResult) {
  const byType = analysis.input_recognition?.by_type ?? {};
  const types = ["quotes", "invoices"];
  let ok = 0;
  let fail = 0;
  for (const key of types) {
    const entry = (byType as Record<string, any>)[key];
    if (!entry) continue;
    const okCount = toNumber(entry.date_parse_success_count) ?? 0;
    const failCount = toNumber(entry.date_parse_fail_count) ?? 0;
    ok += okCount;
    fail += failCount;
  }
  if (ok + fail === 0) return null;
  return clamp01(fail / (ok + fail));
}

function computeMissingnessScore(features: SignalsV1Record) {
  const keys = NUMERIC_KEYS.filter((key) => key !== "missingness_score");
  let missing = 0;
  for (const key of keys) {
    if (features[key] === null) missing += 1;
  }
  if (keys.length === 0) return 0;
  return clamp01(missing / keys.length);
}

export function createEmptySignalsV1Record(): SignalsV1Record {
  const record: SignalsV1Record = {};
  for (const key of SIGNALS_V1_KEYS) {
    if (key === "industry_key") record[key] = "unknown";
    else if (key === "source") record[key] = "mock";
    else if (key === "window_rule") record[key] = "custom";
    else record[key] = null;
  }
  return record;
}

export function guardAgainstPII(features: SignalsV1Record): void {
  const allowedStrings = new Set<string>([...WINDOW_RULES, ...SOURCES, ...INDUSTRIES]);
  const emailPattern = /@/;
  const phonePattern = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/;
  for (const value of Object.values(features)) {
    if (typeof value !== "string") continue;
    if (!allowedStrings.has(value)) {
      throw new Error(`Unexpected string value in features: ${value}`);
    }
    if (emailPattern.test(value) || phonePattern.test(value)) {
      throw new Error(`PII detected in feature string: ${value}`);
    }
  }
}

export function extractSignalsV1(analysis: AnalysisResult): {
  features: SignalsV1Record;
  targets: TrainingExampleV1["targets"];
} {
  const snapshot = getSnapshot(analysis);
  const industry_key = mapIndustryKey(
    [analysis.business_profile?.summary, ...(analysis.business_profile?.services ?? [])].join(" ")
  );
  const source = inferSourceFromManifest(analysis.run_manifest);
  const window_rule = (analysis.decision_artifact?.window?.rule ?? snapshot?.window?.window_type ?? "custom") as WindowRule;
  const window_days = computeWindowDays(analysis, snapshot);
  const coverage_ratio = computeCoverageRatio(analysis, snapshot);
  const mapping_confidence_level = mapConfidenceLevel(analysis.mapping_confidence ?? analysis.decision_artifact?.confidence?.level);

  const quotes_count =
    toNumber(snapshot?.activity_signals?.quotes?.quotes_count) ??
    toNumber(analysis.layer_fusion?.summary?.quotes_recognized) ??
    toNumber(analysis.input_recognition?.by_type?.quotes?.rows_in_window) ??
    0;
  const invoices_count =
    toNumber(snapshot?.activity_signals?.invoices?.invoices_count) ??
    toNumber(analysis.layer_fusion?.summary?.invoices_recognized) ??
    toNumber(analysis.input_recognition?.by_type?.invoices?.rows_in_window) ??
    0;
  const paid_invoices_count = toNumber(snapshot?.activity_signals?.invoices?.invoices_paid_count) ?? 0;
  const calendar_events_count =
    toNumber(analysis.layer_fusion?.summary?.calendar_recognized) ??
    toNumber(analysis.input_recognition?.by_type?.calendar?.rows_in_window) ??
    0;

  const active_days_count = null;
  const quotes_per_active_day = active_days_count && active_days_count > 0 ? quotes_count / active_days_count : null;
  const invoices_per_active_day = active_days_count && active_days_count > 0 ? invoices_count / active_days_count : null;
  const paid_invoice_rate = ratio(paid_invoices_count, invoices_count);
  const quote_to_invoice_rate = ratio(invoices_count, quotes_count);

  const has_quotes = quotes_count > 0 ? 1 : 0;
  const has_invoices = invoices_count > 0 ? 1 : 0;
  const has_calendar = calendar_events_count > 0 ? 1 : 0;

  const decision_lag_days_p50 = toNumber(analysis.layer_fusion?.timing?.quote_created_to_approved_p50_days);
  const decision_lag_days_p90 = null;
  const approved_to_scheduled_days_p50 = toNumber(analysis.layer_fusion?.timing?.approved_to_scheduled_p50_days);
  const approved_to_scheduled_days_p90 = null;
  const invoiced_to_paid_days_p50 = toNumber(analysis.layer_fusion?.timing?.invoiced_to_paid_p50_days);
  const invoiced_to_paid_days_p90 = null;

  const has_decision_lag = decision_lag_days_p50 !== null || decision_lag_days_p90 !== null ? 1 : 0;
  const has_approved_to_scheduled = approved_to_scheduled_days_p50 !== null || approved_to_scheduled_days_p90 !== null ? 1 : 0;
  const has_invoiced_to_paid = invoiced_to_paid_days_p50 !== null || invoiced_to_paid_days_p90 !== null ? 1 : 0;

  const invoice_total_sum_log = null;
  const invoice_total_p50_log = null;
  const invoice_total_p90_log = null;
  const top1_invoice_share = null;
  const top5_invoice_share = null;
  const gini_proxy = null;
  const mid_ticket_share = null;
  const has_amounts = 0;

  const weekly_volume_mean = window_days > 0 ? (quotes_count + invoices_count) / (window_days / 7) : null;
  const volatilityBand = snapshot?.volatility_band ?? null;
  const weekly_volume_cv =
    volatilityBand === "very_low"
      ? 0.1
      : volatilityBand === "low"
        ? 0.2
        : volatilityBand === "medium"
          ? 0.35
          : volatilityBand === "high"
            ? 0.5
            : volatilityBand === "very_high"
              ? 0.7
              : null;
  const seasonStrength = snapshot?.season?.strength ?? null;
  const seasonality_strength =
    seasonStrength === "weak" ? 0.2 : seasonStrength === "moderate" ? 0.5 : seasonStrength === "strong" ? 0.8 : null;
  const weekend_share = null;
  const has_rhythm =
    weekly_volume_mean !== null || weekly_volume_cv !== null || seasonality_strength !== null || weekend_share !== null ? 1 : 0;

  const approvedCount = toNumber(snapshot?.activity_signals?.quotes?.quotes_approved_count);
  const open_quotes_count = approvedCount !== null && quotes_count > 0 ? Math.max(0, quotes_count - approvedCount) : null;
  const open_quotes_share = open_quotes_count !== null ? ratio(open_quotes_count, quotes_count) : null;
  const stale_quotes_share_14d = null;
  const has_open_quotes = open_quotes_count !== null ? 1 : 0;

  const excluded_quotes_outside_window =
    toNumber(analysis.decision_artifact?.window?.excluded_counts?.quotes_outside_window) ??
    toNumber(snapshot?.exclusions?.quotes_outside_window_count) ??
    toNumber(analysis.input_recognition?.by_type?.quotes?.rows_outside_window) ??
    0;
  const excluded_invoices_outside_window =
    toNumber(analysis.decision_artifact?.window?.excluded_counts?.invoices_outside_window) ??
    toNumber(snapshot?.exclusions?.invoices_outside_window_count) ??
    toNumber(analysis.input_recognition?.by_type?.invoices?.rows_outside_window) ??
    0;
  const excluded_calendar_outside_window =
    toNumber(analysis.decision_artifact?.window?.excluded_counts?.calendar_outside_window) ??
    toNumber(snapshot?.exclusions?.calendar_outside_window_count) ??
    toNumber(analysis.input_recognition?.by_type?.calendar?.rows_outside_window) ??
    0;
  const excluded_total = excluded_quotes_outside_window + excluded_invoices_outside_window + excluded_calendar_outside_window;
  const excluded_ratio = ratio(excluded_total, quotes_count + invoices_count + calendar_events_count + excluded_total) ?? 0;

  const duplicate_id_rate = null;
  const date_parse_error_rate = computeDateParseErrorRate(analysis);

  const features: SignalsV1Record = {
    industry_key,
    source,
    window_rule: WINDOW_RULES.includes(window_rule) ? window_rule : "custom",
    window_days,
    coverage_ratio: clamp01(coverage_ratio),
    mapping_confidence_level,
    missingness_score: 0,
    quotes_count,
    invoices_count,
    paid_invoices_count,
    calendar_events_count,
    active_days_count,
    quotes_per_active_day,
    invoices_per_active_day,
    paid_invoice_rate,
    quote_to_invoice_rate,
    has_quotes,
    has_invoices,
    has_calendar,
    decision_lag_days_p50,
    decision_lag_days_p90,
    approved_to_scheduled_days_p50,
    approved_to_scheduled_days_p90,
    invoiced_to_paid_days_p50,
    invoiced_to_paid_days_p90,
    has_decision_lag,
    has_approved_to_scheduled,
    has_invoiced_to_paid,
    invoice_total_sum_log,
    invoice_total_p50_log,
    invoice_total_p90_log,
    top1_invoice_share,
    top5_invoice_share,
    gini_proxy,
    mid_ticket_share,
    has_amounts,
    weekly_volume_mean,
    weekly_volume_cv,
    seasonality_strength,
    weekend_share,
    has_rhythm,
    open_quotes_count,
    open_quotes_share,
    stale_quotes_share_14d,
    has_open_quotes,
    excluded_quotes_outside_window,
    excluded_invoices_outside_window,
    excluded_calendar_outside_window,
    excluded_ratio: clamp01(excluded_ratio),
    duplicate_id_rate,
    date_parse_error_rate,
  };

  features.missingness_score = computeMissingnessScore(features);
  guardAgainstPII(features);

  const pressures = analysis.decision_artifact?.pressure_map ?? [];
  const pressure_keys =
    pressures.length > 0
      ? pressures.slice(0, 3).map((p) => p.key)
      : analysis.layer_fusion?.pressure_patterns?.slice(0, 3).map((p) => p.id) ?? [];

  const hasFollowUp =
    pressures.some((p) => p.key === "follow_up_drift") ||
    analysis.layer_fusion?.pressure_patterns?.some((p) => p.id === "followup_drift") ||
    false;

  const boundaryText = analysis.decision_artifact?.boundary ?? "";
  const isMappingBoundary = boundaryText.toLowerCase().includes("mapping") || boundaryText.toLowerCase().includes("map");
  const confidenceLow =
    analysis.mapping_confidence === "low" || analysis.decision_artifact?.confidence?.level === "low";

  let boundary_class: BoundaryClass = "unknown";
  if (confidenceLow || isMappingBoundary) boundary_class = "confirm_mappings";
  else if (hasFollowUp) boundary_class = "follow_up";
  else if (pressure_keys.length > 0) boundary_class = "stable";

  const benchmark =
    analysis.decision_artifact?.benchmarks?.metrics?.map((metric) => ({
      key: metric.key,
      percentile: metric.percentile,
      value: metric.value,
      peer_median: metric.peer_median,
    })) ?? undefined;

  const targets: TrainingExampleV1["targets"] = {
    pressure_keys,
    boundary_class,
    benchmark,
  };

  return { features, targets };
}
