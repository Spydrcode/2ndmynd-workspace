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

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateConclusion(obj: unknown) {
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

function getSignalRoot(snapshot: any) {
  if (snapshot?.signals_flat && typeof snapshot.signals_flat === "object") {
    return snapshot.signals_flat;
  }
  if (snapshot?.signals && typeof snapshot.signals === "object") {
    return snapshot.signals;
  }
  return null;
}

function getByPath(obj: any, path: string): unknown {
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object" || !(p in cur)) {
      if (p === "signals" && obj?.signals_flat && typeof obj.signals_flat === "object") {
        const remainder = parts.slice(1).join(".");
        if (remainder && remainder in obj.signals_flat) {
          return (obj.signals_flat as Record<string, unknown>)[remainder];
        }
      }
      return undefined;
    }
    cur = cur[p];
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

export function validateEvidenceSignalsAgainstSnapshot(
  snapshot: any,
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

    const path = item.slice(0, eqIdx).trim();
    const expected = item.slice(eqIdx + 1).trim();

    if (!path.startsWith("signals.")) {
      errors.push(`evidence_signals[${i}] path must start with 'signals.': "${path}"`);
      continue;
    }

    const actual = getByPath(snapshot, path);
    if (actual === undefined) {
      missing.push(path);
      errors.push(`evidence_signals[${i}] path not found in snapshot: "${path}"`);
      continue;
    }

    if (actual !== null && typeof actual === "object") {
      errors.push(
        `evidence_signals[${i}] path resolves to non-literal (object/array): "${path}"`
      );
      continue;
    }

    const actualStr = literalToString(actual);
    if (expected !== actualStr) {
      errors.push(
        `evidence_signals[${i}] value mismatch at "${path}": expected "${expected}", actual "${actualStr}"`
      );
    }
  }

  return { ok: errors.length === 0, errors, missing };
}

export function validateGrounding(conclusion: ConclusionV1, snapshot: unknown) {
  const signals = getSignalRoot(snapshot);
  if (!signals) {
    return { ok: false, errors: ["snapshot.signals is missing"], missing: [] as string[] };
  }

  return validateEvidenceSignalsAgainstSnapshot(snapshot, conclusion.evidence_signals);
}
