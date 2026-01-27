export type Confidence = "low" | "medium" | "high";
export type VolatilityBand = "very_low" | "low" | "medium" | "high" | "very_high";

export type SeasonPhase = "Rising" | "Active" | "Peak" | "Lower";
export type SeasonStrength = "weak" | "moderate" | "strong";
export type SeasonPredictability = "low" | "medium" | "high";

export type SnapshotV2 = {
  snapshot_version: "snapshot_v2";
  pii_scrubbed: boolean;
  window: {
    slice_start: string;
    slice_end: string;
    report_date: string;
    lookback_days: number;
    sample_confidence: Confidence;
  };
  activity_signals: {
    quotes: {
      quotes_count: number;
      quotes_approved_count: number;
      approval_rate_band: VolatilityBand;
      decision_lag_band: VolatilityBand;
      quote_total_bands: { small: number; medium: number; large: number };
    };
    invoices: {
      invoices_count: number;
      invoices_paid_count: number;
      invoice_total_bands: { small: number; medium: number; large: number };
      payment_lag_band_distribution: {
        very_low: number;
        low: number;
        medium: number;
        high: number;
        very_high: number;
      };
    };
  };
  volatility_band: VolatilityBand;
  season: {
    phase: SeasonPhase;
    strength: SeasonStrength;
    predictability: SeasonPredictability;
  };
  input_costs: Array<{
    name: string;
    unit: string;
    current: number;
    change_30d_pct: number;
    change_90d_pct: number;
    volatility_band: VolatilityBand;
  }>;
};

export type ConclusionV2 = {
  conclusion_version: "conclusion_v2";
  pattern_id: string;
  one_sentence_pattern: string;
  decision: string;
  why_this_now: string;
  boundary: string;
  confidence: Confidence;
  evidence_signals: string[];
  season_context: string;
  optional_next_steps?: string[];
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

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateConclusionV2(obj: unknown) {
  const errors: string[] = [];
  if (!obj || typeof obj !== "object") {
    return { ok: false, errors: ["output must be an object"] };
  }

  const candidate = obj as Partial<ConclusionV2>;
  for (const key of REQUIRED_KEYS) {
    if (!(key in candidate)) {
      errors.push(`missing required key: ${key}`);
    }
  }

  if (candidate.conclusion_version !== "conclusion_v2") {
    errors.push("conclusion_version must equal conclusion_v2");
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
  if (!isNonEmptyString(candidate.why_this_now)) {
    errors.push("why_this_now must be a non-empty string");
  }
  if (!isNonEmptyString(candidate.boundary)) {
    errors.push("boundary must be a non-empty string");
  }
  if (!isNonEmptyString(candidate.season_context)) {
    errors.push("season_context must be a non-empty string");
  }
  if (candidate.confidence !== "low" && candidate.confidence !== "medium" && candidate.confidence !== "high") {
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

  if (candidate.optional_next_steps !== undefined) {
    if (!Array.isArray(candidate.optional_next_steps)) {
      errors.push("optional_next_steps must be an array when provided");
    } else if (candidate.optional_next_steps.length > 3) {
      errors.push("optional_next_steps must have 0 to 3 items");
    } else {
      for (const item of candidate.optional_next_steps) {
        if (!isNonEmptyString(item)) {
          errors.push("optional_next_steps items must be non-empty strings");
          break;
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function getByPath(obj: any, path: string): unknown {
  const parts = path.split(".");
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= cur.length) return undefined;
      cur = cur[index];
      continue;
    }
    if (typeof cur !== "object" || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function literalToString(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return JSON.stringify(v);
}

export function validateEvidenceSignalsAgainstSnapshotV2(
  snapshot: SnapshotV2,
  evidenceSignals: unknown
) {
  const errors: string[] = [];
  const missing: string[] = [];

  if (!Array.isArray(evidenceSignals)) {
    return { ok: false, errors: ["evidence_signals is not an array"], missing };
  }

  if (evidenceSignals.length < 3 || evidenceSignals.length > 6) {
    errors.push(`evidence_signals length must be 3..6, got ${evidenceSignals.length}`);
  }

  for (let i = 0; i < evidenceSignals.length; i += 1) {
    const item = evidenceSignals[i];
    if (typeof item !== "string") {
      errors.push(`evidence_signals[${i}] is not a string`);
      continue;
    }

    const eqIdx = item.indexOf("=");
    if (eqIdx <= 0 || eqIdx !== item.lastIndexOf("=")) {
      errors.push(`evidence_signals[${i}] must contain exactly one '=': "${item}"`);
      continue;
    }

    const rawPath = item.slice(0, eqIdx).trim();
    const expected = item.slice(eqIdx + 1).trim();

    if (!rawPath.startsWith("signals.")) {
      errors.push(`evidence_signals[${i}] path must start with 'signals.': "${rawPath}"`);
      continue;
    }

    const path = rawPath.replace(/^signals\./, "");
    const actual = getByPath(snapshot, path);
    if (actual === undefined) {
      missing.push(rawPath);
      errors.push(`evidence_signals[${i}] path not found in snapshot: "${rawPath}"`);
      continue;
    }

    if (actual !== null && typeof actual === "object") {
      errors.push(
        `evidence_signals[${i}] path resolves to non-literal (object/array): "${rawPath}"`
      );
      continue;
    }

    const actualStr = literalToString(actual);
    if (expected !== actualStr) {
      errors.push(
        `evidence_signals[${i}] value mismatch at "${rawPath}": expected "${expected}", actual "${actualStr}"`
      );
    }
  }

  return { ok: errors.length === 0, errors, missing };
}

export function seasonSanityCheck(snapshot: SnapshotV2) {
  const warnings: string[] = [];
  const quotesCount = snapshot.activity_signals?.quotes?.quotes_count ?? 0;
  const invoicesCount = snapshot.activity_signals?.invoices?.invoices_count ?? 0;
  const total = quotesCount + invoicesCount;

  if (snapshot.season.phase === "Peak" && total < 3) {
    warnings.push("season.phase is Peak but activity is near zero");
  }
  if (
    snapshot.season.predictability === "high" &&
    (snapshot.volatility_band === "high" || snapshot.volatility_band === "very_high")
  ) {
    warnings.push("season.predictability is high but volatility is high");
  }

  let maxConfidence: Confidence = "high";
  if (warnings.length >= 2) maxConfidence = "low";
  else if (warnings.length === 1) maxConfidence = "medium";

  return { ok: warnings.length === 0, warnings, max_confidence: maxConfidence };
}
