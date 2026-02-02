import type { SnapshotV2, VolatilityBand } from "./conclusion_schema_v2";

export type EvidenceSignal = {
  path: string;
  raw_value: string;
};

export type EvidenceChip = {
  label: string;
  value: string;
  explanation: string;
  severity: "low" | "medium" | "high";
};

function titleCase(value: string) {
  return value
    .split(/[\s_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeBand(value: string): VolatilityBand | null {
  const v = value.trim().toLowerCase();
  if (v === "very_low" || v === "low" || v === "medium" || v === "high" || v === "very_high") {
    return v;
  }
  return null;
}

function bandWord(value: VolatilityBand) {
  return value.replace("_", " ");
}

function parseIntMaybe(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseEvidenceSignal(value: string): EvidenceSignal | null {
  const eqIdx = value.indexOf("=");
  if (eqIdx <= 0 || eqIdx !== value.lastIndexOf("=")) return null;
  const path = value.slice(0, eqIdx).trim();
  const raw_value = value.slice(eqIdx + 1).trim();
  if (!path) return null;
  return { path, raw_value };
}

function severityForBand(band: VolatilityBand, mode: "good_when_high" | "bad_when_high" | "neutral") {
  if (mode === "neutral") return band === "very_high" || band === "high" ? "medium" : "low";
  if (mode === "good_when_high") {
    if (band === "very_low" || band === "low") return "high";
    if (band === "medium") return "medium";
    return "low";
  }
  // bad_when_high
  if (band === "very_high" || band === "high") return "high";
  if (band === "medium") return "medium";
  return "low";
}

export function describeEvidenceSignal(signal: EvidenceSignal, snapshot: SnapshotV2 | null): EvidenceChip {
  const { path, raw_value } = signal;

  if (path.endsWith(".approval_rate_band")) {
    const band = normalizeBand(raw_value) ?? "medium";
    return {
      label: "Approvals",
      value: titleCase(bandWord(band)),
      severity: severityForBand(band, "good_when_high"),
      explanation:
        band === "very_low" || band === "low"
          ? "Approvals look harder to win than usual, which can quietly add follow-up pressure and rework."
          : "Approvals look steady enough that pressure likely comes from timing and flow, not winning work.",
    };
  }

  if (path.endsWith(".decision_lag_band")) {
    const band = normalizeBand(raw_value) ?? "medium";
    return {
      label: "Decision timing",
      value: titleCase(bandWord(band)),
      severity: severityForBand(band, "bad_when_high"),
      explanation:
        band === "very_high" || band === "high"
          ? "Decisions are taking longer, which can create a loop of follow-ups, rescheduling, and uncertainty."
          : "Decision timing looks contained enough that follow-up can stay predictable.",
    };
  }

  if (path.endsWith(".invoices_paid_count")) {
    const paid = parseIntMaybe(raw_value);
    const invoicesCount = snapshot?.activity_signals.invoices.invoices_count ?? null;
    return {
      label: "Paid invoices detected",
      value: paid === null ? raw_value : String(paid),
      severity: paid === 0 ? "high" : paid !== null && paid < 5 ? "medium" : "low",
      explanation:
        paid === 0
          ? invoicesCount === 0
            ? "We didn’t detect invoices in the snapshot window, so paid-invoice signals may be missing due to mapping."
            : "We didn’t detect any paid invoices in the snapshot window. This can be a mapping issue or a real cash timing issue."
          : "Paid invoices were detected, so cash timing signals are grounded in real payments.",
    };
  }

  if (path.endsWith(".invoices_count")) {
    const invoices = parseIntMaybe(raw_value);
    return {
      label: "Invoices detected",
      value: invoices === null ? raw_value : String(invoices),
      severity: invoices === 0 ? "high" : invoices !== null && invoices < 10 ? "medium" : "low",
      explanation:
        invoices === 0
          ? "No invoices were detected in the snapshot window. If you uploaded invoices, this usually means a column-mapping mismatch."
          : "Invoices were detected and included in the snapshot window.",
    };
  }

  if (path.endsWith(".quotes_count")) {
    const quotes = parseIntMaybe(raw_value);
    return {
      label: "Quotes detected",
      value: quotes === null ? raw_value : String(quotes),
      severity: quotes === 0 ? "high" : quotes !== null && quotes < 10 ? "medium" : "low",
      explanation:
        quotes === 0
          ? "No quotes were detected in the snapshot window. This can happen if dates didn’t parse or the export is out of range."
          : "Quotes were detected and included in the snapshot window.",
    };
  }

  if (path.endsWith(".volatility_band")) {
    const band = normalizeBand(raw_value) ?? "medium";
    return {
      label: "Rhythm volatility",
      value: titleCase(bandWord(band)),
      severity: severityForBand(band, "bad_when_high"),
      explanation:
        band === "very_high" || band === "high"
          ? "Daily totals swing sharply, which often shows up as planning pressure and reactive scheduling."
          : "Daily totals look relatively stable, which usually reduces planning pressure.",
    };
  }

  if (path.startsWith("signals.season.")) {
    return {
      label: "Season context",
      value: raw_value ? titleCase(raw_value) : "Unknown",
      severity: "low",
      explanation: "Season context is used only to explain pressure, not to forecast results.",
    };
  }

  const tail = path.split(".").slice(-1)[0] ?? path;
  return {
    label: titleCase(tail),
    value: raw_value,
    severity: "low",
    explanation: "This is a supporting signal used to ground the snapshot.",
  };
}
