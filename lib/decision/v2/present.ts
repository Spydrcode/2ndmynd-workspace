import type { ConclusionV2, SnapshotV2 } from "./conclusion_schema_v2";
import { describeEvidenceSignal, parseEvidenceSignal } from "./signal_catalog";

export type PresentedArtifact = {
  header: {
    title: string;
    run_id: string;
    created_at: string | null;
    confidence: "low" | "medium" | "high" | "unknown";
    source: "mock" | "live" | "unknown";
  };
  takeaway: string;
  next_action: string;
  micro_steps: string[];
  why_heavy: string;
  evidence_chips: Array<{
    label: string;
    value: string;
    explanation: string;
    severity: "low" | "medium" | "high";
  }>;
  data_health: {
    quotes_count: number | null;
    invoices_count: number | null;
    date_range: string | null;
    coverage_text: string;
  };
  data_warnings: string[];
  technical_signals: Array<{ key: string; value: string }>;
};

function inferSource(mode: unknown): PresentedArtifact["header"]["source"] {
  const v = typeof mode === "string" ? mode.toLowerCase() : "";
  if (v.includes("mock")) return "mock";
  if (v.includes("live")) return "live";
  return "unknown";
}

function asSnapshotV2(value: unknown): SnapshotV2 | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.snapshot_version !== "snapshot_v2") return null;
  return value as SnapshotV2;
}

function asConclusionV2(value: unknown): ConclusionV2 | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.conclusion_version !== "conclusion_v2") return null;
  return value as ConclusionV2;
}

export function presentArtifact(params: {
  run_id: string;
  created_at: string | null;
  mode?: string | null;
  artifact: {
    conclusion: unknown;
    snapshot: unknown | null;
    input_health: { date_range: string | null; records_count: number | null; coverage_warnings: string[] } | null;
    data_warnings?: string[] | null;
  };
}): PresentedArtifact {
  const snapshot = asSnapshotV2(params.artifact.snapshot);
  const conclusion = asConclusionV2(params.artifact.conclusion);

  const confidence =
    conclusion?.confidence === "low" || conclusion?.confidence === "medium" || conclusion?.confidence === "high"
      ? conclusion.confidence
      : snapshot?.window.sample_confidence ?? "unknown";

  const evidenceSignals = Array.isArray(conclusion?.evidence_signals) ? (conclusion.evidence_signals as string[]) : [];
  const technical_signals: Array<{ key: string; value: string }> = [];
  const evidence_chips = evidenceSignals
    .map((raw) => {
      const parsed = parseEvidenceSignal(raw);
      if (!parsed) return null;
      technical_signals.push({ key: parsed.path, value: parsed.raw_value });
      return describeEvidenceSignal(parsed, snapshot);
    })
    .filter(Boolean) as PresentedArtifact["evidence_chips"];

  const inputHealth = params.artifact.input_health;
  const coverageWarnings = inputHealth?.coverage_warnings ?? [];
  const coverage_text = coverageWarnings.length ? coverageWarnings.join(" ") : "Coverage looks complete.";

  const quotes_count = snapshot?.activity_signals.quotes.quotes_count ?? null;
  const invoices_count = snapshot?.activity_signals.invoices.invoices_count ?? null;

  const data_warnings = Array.isArray(params.artifact.data_warnings)
    ? (params.artifact.data_warnings.filter((w) => typeof w === "string") as string[])
    : [];

  const takeaway =
    typeof conclusion?.one_sentence_pattern === "string" && conclusion.one_sentence_pattern.trim().length
      ? conclusion.one_sentence_pattern.trim()
      : "Snapshot is still assembling.";

  const next_action =
    typeof conclusion?.decision === "string" && conclusion.decision.trim().length
      ? conclusion.decision.trim()
      : "Decision pending.";

  const why_heavy =
    typeof conclusion?.why_this_now === "string" && conclusion.why_this_now.trim().length
      ? conclusion.why_this_now.trim()
      : "Supporting context is still loading.";

  const micro_steps = Array.isArray(conclusion?.optional_next_steps)
    ? (conclusion.optional_next_steps.filter((s: unknown) => typeof s === "string").slice(0, 2) as string[])
    : [];

  return {
    header: {
      title: "Business snapshot",
      run_id: params.run_id,
      created_at: params.created_at,
      confidence,
      source: inferSource(params.mode),
    },
    takeaway,
    next_action,
    micro_steps,
    why_heavy,
    evidence_chips,
    data_health: {
      quotes_count,
      invoices_count,
      date_range: inputHealth?.date_range ?? null,
      coverage_text,
    },
    data_warnings,
    technical_signals,
  };
}
