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

export function validateGrounding(conclusion: ConclusionV1, snapshot: unknown) {
  const errors: string[] = [];
  const signals = getSignalRoot(snapshot);
  if (!signals) {
    return { ok: false, errors: ["snapshot.signals is missing"] };
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
