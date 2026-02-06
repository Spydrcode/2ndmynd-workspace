/**
 * Present Coherence Snapshot — transform coherence engine output into UI-ready data.
 *
 * DOCTRINE:
 * - No benchmarks, no KPIs, no external comparisons.
 * - Language is calm, structural, anchored to the owner's own intent.
 * - The output is a finite analysis, not a dashboard.
 */

import type {
  CoherenceSnapshot,
  CoherenceTension,
  DecisionPathCoherence,
  ValuePropAlignment,
  SupportStatus,
  IntentConfidence,
  DataCoverage,
  ValueVisibilityImpact,
  CoherenceDrift,
} from "../types/coherence_engine";

// ── UI-ready types ──

export type PresentedCoherenceArtifact = {
  version: "presented_coherence_v1";
  run_id: string;
  created_at: string;

  // Header
  headline: string;
  subheadline: string;
  confidence: { level: string; reason: string };

  /** One-line summary at top of alignment section. */
  alignment_summary: string;

  // Intent summary card
  intent_summary: {
    value_proposition: string;
    priorities: string[];
    non_negotiables: string[];
    contradictions?: string[];
  };

  // Signal overview
  signal_overview: {
    total_records: number;
    window: string;
    highlights: string[];
    missing_data: string[];
  };

  // Data coverage card (above alignment)
  data_coverage_card?: PresentedDataCoverage;

  // Value-prop alignment section (NEW — sits between signals and tensions)
  alignment_section: {
    title: string;
    items: PresentedAlignment[];
  };

  // Tension cards (main content)
  tension_cards: PresentedTension[];

  // Decision paths
  path_cards: PresentedPath[];

  // Drift section (monthly review only)
  drift_section?: PresentedDrift;

  // Footer / metadata
  end_state: string;
};

// ── Data coverage ──

export type PresentedDataCoverage = {
  title: string;
  overall_note: string;
  sources: Array<{
    name: string;
    status: string;
    status_label: string;
    record_count: number;
    note: string;
  }>;
  visibility_impacts: Array<{
    tag: string;
    label: string;
    visibility: string;
    visibility_label: string;
    reason: string;
  }>;
};

// ── Drift ──

export type PresentedDrift = {
  title: string;
  summary: string;
  days_between: number;
  alignment_changes: Array<{
    label: string;
    prior: string;
    current: string;
    direction: string;
    direction_label: string;
    note: string;
  }>;
  tension_changes: Array<{
    intent_anchor: string;
    prior_severity: number;
    current_severity: number;
    direction: string;
    direction_label: string;
    note: string;
  }>;
  structural_notes: string[];
  what_to_decide_now: string;
};

export type PresentedTension = {
  id: string;
  severity: number;
  severity_label: "low" | "moderate" | "significant" | "high";
  intent_anchor: string;
  claim: string;
  mechanism: string;
  owner_cost: string;
  what_must_be_true: string[];
  signal_count: number;
};

export type PresentedPath = {
  name: "path_A" | "path_B" | "neither";
  label: string;
  thesis: string;
  protects: string[];
  trades_off: string[];
  /** Value-prop labels this path protects (anchored to intent). */
  protects_values?: string[];
  /** Value-prop labels this path relaxes (anchored to intent). */
  relaxes_values?: string[];
  operational_shifts: string[];
  risks: string[];
  seven_day_steps: Array<{
    title: string;
    why: string;
    how: string;
    effort: string;
  }>;
  thirty_day_followup: { title: string; why: string };
  boundary_warning: string;
};

export type PresentedAlignment = {
  tag: string;
  label: string;
  support: SupportStatus;
  support_label: string;
  confidence: IntentConfidence;
  confidence_label: string;
  evidence_bullets: string[];
  /** Safe helper copy for unknown items. */
  unknown_helper?: string;
  gentle_check?: string;
  /** True when confidence is low/med and owner hasn't confirmed — show confirmation hook. */
  needs_confirmation?: boolean;
};

// ── Main presenter ──

export function presentCoherenceSnapshot(
  cs: CoherenceSnapshot,
  drift?: CoherenceDrift
): PresentedCoherenceArtifact {
  const headline = buildHeadline(cs);
  const subheadline = buildSubheadline(cs);

  const intentSummary = {
    value_proposition: cs.intent.value_proposition.statement,
    priorities: cs.intent.priorities_ranked,
    non_negotiables: cs.intent.non_negotiables,
    contradictions: cs.intent.detected_contradictions,
  };

  const signalHighlights = cs.signals.signals
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 4)
    .map((s) => s.observation);

  const signalOverview = {
    total_records: cs.signals.window.records_used,
    window: `${cs.signals.window.start_date} to ${cs.signals.window.end_date}`,
    highlights: signalHighlights,
    missing_data: cs.signals.missing_data,
  };

  const tensionCards = cs.tensions.map(presentTension);
  const pathCards = cs.paths.map(presentPath);
  const alignmentSection = presentAlignmentSection(cs.value_prop_alignment);
  const alignmentSummary = buildAlignmentSummary(cs.value_prop_alignment, cs.intent);

  // Data coverage card
  const data_coverage_card = cs.data_coverage
    ? presentDataCoverage(cs.data_coverage, cs.value_visibility)
    : undefined;

  // Drift section (monthly review)
  const drift_section = drift ? presentDrift(drift) : undefined;

  return {
    version: "presented_coherence_v1",
    run_id: cs.run_id,
    created_at: cs.created_at,
    headline,
    subheadline,
    confidence: cs.confidence,
    alignment_summary: alignmentSummary,
    intent_summary: intentSummary,
    signal_overview: signalOverview,
    data_coverage_card,
    alignment_section: alignmentSection,
    tension_cards: tensionCards,
    path_cards: pathCards,
    drift_section,
    end_state: cs.end_state.state,
  };
}

// ── Helpers ──

function buildHeadline(cs: CoherenceSnapshot): string {
  if (cs.tensions.length === 0) {
    return "Your business appears aligned with your stated intent.";
  }
  const topTension = cs.tensions[0];
  if (topTension.severity >= 70) {
    return `One meaningful tension between what you want and what's happening.`;
  }
  if (topTension.severity >= 40) {
    return `A few areas where your reality and intent don't quite match.`;
  }
  return `Your business is mostly in line with what you've described.`;
}

function buildSubheadline(cs: CoherenceSnapshot): string {
  const tensionCount = cs.tensions.length;
  if (tensionCount === 0) return "No significant tensions detected.";
  if (tensionCount === 1) return "We found 1 tension worth understanding.";
  return `We found ${tensionCount} tensions worth understanding.`;
}

function presentTension(t: CoherenceTension): PresentedTension {
  let severityLabel: PresentedTension["severity_label"];
  if (t.severity >= 75) severityLabel = "high";
  else if (t.severity >= 50) severityLabel = "significant";
  else if (t.severity >= 25) severityLabel = "moderate";
  else severityLabel = "low";

  return {
    id: t.id,
    severity: t.severity,
    severity_label: severityLabel,
    intent_anchor: t.intent_anchor,
    claim: t.claim,
    mechanism: t.mechanism,
    owner_cost: t.owner_cost,
    what_must_be_true: t.what_must_be_true,
    signal_count: t.evidence.signal_ids.length,
  };
}

function presentPath(p: DecisionPathCoherence): PresentedPath {
  return {
    name: p.name,
    label: p.name === "path_A" ? "Path A" : p.name === "path_B" ? "Path B" : "Neither",
    thesis: p.thesis,
    protects: p.protects,
    trades_off: p.trades_off,
    protects_values: p.protects_values,
    relaxes_values: p.relaxes_values,
    operational_shifts: p.operational_shift,
    risks: p.risks,
    seven_day_steps: p.seven_day_plan.steps.map((s) => ({
      title: s.title,
      why: s.why,
      how: s.how,
      effort: s.effort,
    })),
    thirty_day_followup: p.thirty_day_followup,
    boundary_warning: p.boundary_warning,
  };
}

// ── Alignment helpers ──

const SUPPORT_LABELS: Record<SupportStatus, string> = {
  supported: "Supported by your data",
  mixed: "Mixed signals",
  crowded_out: "Under pressure",
  unknown: "Not enough data",
};

const CONFIDENCE_LABELS: Record<IntentConfidence, string> = {
  high: "High confidence",
  med: "Medium confidence",
  low: "Low confidence",
};

function presentAlignmentSection(
  alignments: ValuePropAlignment[]
): PresentedCoherenceArtifact["alignment_section"] {
  return {
    title: "What your business is protecting (and what pressure is crowding out)",
    items: alignments.map(presentAlignment),
  };
}

function presentAlignment(a: ValuePropAlignment): PresentedAlignment {
  const result: PresentedAlignment = {
    tag: a.tag,
    label: a.label,
    support: a.support,
    support_label: SUPPORT_LABELS[a.support],
    confidence: a.confidence,
    confidence_label: CONFIDENCE_LABELS[a.confidence],
    evidence_bullets: a.evidence.bullets,
    gentle_check: a.gentle_check,
    needs_confirmation: a.confidence === "low" || a.confidence === "med",
  };

  if (a.support === "unknown") {
    result.unknown_helper =
      "We can't see this clearly from the data provided. That's common — scheduling or estimates usually make it visible, but we can still work with what's here.";
  }

  return result;
}

/**
 * Build a one-line alignment summary for the top of the coherence view.
 * If no strong signals, returns a neutral fallback.
 */
function buildAlignmentSummary(
  alignments: ValuePropAlignment[],
  intent: CoherenceSnapshot["intent"]
): string {
  // Find best supported value (highest confidence among "supported")
  const supported = alignments
    .filter((a) => a.support === "supported")
    .sort((a, b) => {
      const order = { high: 0, med: 1, low: 2 };
      return order[a.confidence] - order[b.confidence];
    });

  // Find most crowded-out value (most pressure evidence)
  const crowded = alignments
    .filter((a) => a.support === "crowded_out")
    .sort((a, b) => b.evidence.signal_ids.length - a.evidence.signal_ids.length);

  const topSupported = supported[0];
  const topCrowded = crowded[0];

  if (topSupported && topCrowded) {
    return `You're clearly protecting **${topSupported.label}**, but **${topCrowded.label}** is getting crowded out by pressure.`;
  }

  if (topSupported) {
    return `Your data shows clear support for **${topSupported.label}**.`;
  }

  if (topCrowded) {
    return `**${topCrowded.label}** appears to be under pressure from operational demands.`;
  }

  // Fallback when no clear signals
  return "We're still building a picture of how your values show up in the data.";
}

// ── Data coverage presenter ──

const COVERAGE_STATUS_LABELS: Record<string, string> = {
  present: "Available",
  partial: "Limited",
  absent: "Not provided",
};

const VISIBILITY_LABELS: Record<string, string> = {
  clear: "Clear visibility",
  partial: "Partial visibility",
  limited: "Limited visibility",
};

function presentDataCoverage(
  coverage: DataCoverage,
  visibility?: ValueVisibilityImpact[]
): PresentedDataCoverage {
  return {
    title: "What data we're working with",
    overall_note: coverage.overall_note,
    sources: coverage.sources.map((s) => ({
      name: s.name,
      status: s.status,
      status_label: COVERAGE_STATUS_LABELS[s.status] ?? s.status,
      record_count: s.record_count,
      note: s.note,
    })),
    visibility_impacts: (visibility ?? []).map((v) => ({
      tag: v.tag,
      label: v.label,
      visibility: v.visibility,
      visibility_label: VISIBILITY_LABELS[v.visibility] ?? v.visibility,
      reason: v.reason,
    })),
  };
}

// ── Drift presenter (monthly review) ──

const ALIGNMENT_DIRECTION_LABELS: Record<string, string> = {
  improved: "Improved",
  unchanged: "Unchanged",
  declined: "Declined",
};

const TENSION_DIRECTION_LABELS: Record<string, string> = {
  eased: "Eased",
  unchanged: "Unchanged",
  worsened: "Worsened",
};

function presentDrift(drift: CoherenceDrift): PresentedDrift {
  return {
    title: "What changed since last time",
    summary: drift.summary,
    days_between: drift.days_between,
    alignment_changes: drift.alignment_deltas.map((d) => ({
      label: d.label,
      prior: SUPPORT_LABELS[d.prior_support] ?? d.prior_support,
      current: SUPPORT_LABELS[d.current_support] ?? d.current_support,
      direction: d.direction,
      direction_label: ALIGNMENT_DIRECTION_LABELS[d.direction] ?? d.direction,
      note: d.note,
    })),
    tension_changes: drift.tension_shifts.map((t) => ({
      intent_anchor: t.intent_anchor,
      prior_severity: t.prior_severity,
      current_severity: t.current_severity,
      direction: t.direction,
      direction_label: TENSION_DIRECTION_LABELS[t.direction] ?? t.direction,
      note: t.note,
    })),
    structural_notes: drift.structural_notes,
    what_to_decide_now: drift.what_to_decide_now,
  };
}
