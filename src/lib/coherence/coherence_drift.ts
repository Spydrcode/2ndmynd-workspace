/**
 * coherence_drift.ts — Compute alignment + tension drift between two coherence snapshots.
 *
 * DOCTRINE:
 * - No benchmarks, no judgment, no "better/worse" framing.
 * - Describe what changed structurally — let the owner decide what it means.
 * - Summary and notes use calm, present-tense language.
 */

import type {
  CoherenceSnapshot,
  CoherenceDrift,
  AlignmentDelta,
  TensionShift,
  SupportStatus,
} from "../types/coherence_engine";

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

type DriftInput = {
  previous: CoherenceSnapshot;
  current: CoherenceSnapshot;
};

/**
 * Compare two coherence snapshots and produce a drift narrative.
 * Returns alignment changes, tension shifts, structural notes, and a summary.
 */
export function computeCoherenceDrift(input: DriftInput): CoherenceDrift {
  const { previous, current } = input;

  const daysBetween = computeDaysBetween(previous.created_at, current.created_at);
  const alignmentDeltas = computeAlignmentDeltas(previous, current);
  const tensionShifts = computeTensionShifts(previous, current);
  const structuralNotes = computeStructuralNotes(previous, current, tensionShifts);
  const summary = buildDriftSummary(alignmentDeltas, tensionShifts, daysBetween);
  const whatToDecideNow = buildDecisionPrompt(alignmentDeltas, tensionShifts);

  return {
    version: "drift_v1",
    previous_run_id: previous.run_id,
    current_run_id: current.run_id,
    days_between: daysBetween,
    alignment_deltas: alignmentDeltas,
    tension_shifts: tensionShifts,
    summary,
    structural_notes: structuralNotes,
    what_to_decide_now: whatToDecideNow,
  };
}

// ============================================================================
// ALIGNMENT DELTAS
// ============================================================================

function computeAlignmentDeltas(
  previous: CoherenceSnapshot,
  current: CoherenceSnapshot
): AlignmentDelta[] {
  const deltas: AlignmentDelta[] = [];

  for (const curAlign of current.value_prop_alignment) {
    const prevAlign = previous.value_prop_alignment.find((a) => a.tag === curAlign.tag);

    if (!prevAlign) {
      // New value tag appeared
      deltas.push({
        tag: curAlign.tag,
        label: curAlign.label,
        prior_support: "unknown",
        current_support: curAlign.support,
        direction: curAlign.support === "supported" ? "improved" : "unchanged",
        note: `${curAlign.label} is newly tracked in this analysis.`,
      });
      continue;
    }

    const direction = classifyAlignmentDirection(prevAlign.support, curAlign.support);

    deltas.push({
      tag: curAlign.tag,
      label: curAlign.label,
      prior_support: prevAlign.support,
      current_support: curAlign.support,
      direction,
      note: buildAlignmentNote(curAlign.label, prevAlign.support, curAlign.support, direction),
    });
  }

  return deltas;
}

const SUPPORT_ORDER: Record<SupportStatus, number> = {
  supported: 3,
  mixed: 2,
  crowded_out: 1,
  unknown: 0,
};

function classifyAlignmentDirection(
  prior: SupportStatus,
  current: SupportStatus
): AlignmentDelta["direction"] {
  const priorScore = SUPPORT_ORDER[prior];
  const currentScore = SUPPORT_ORDER[current];

  if (currentScore > priorScore) return "improved";
  if (currentScore < priorScore) return "declined";
  return "unchanged";
}

function buildAlignmentNote(
  label: string,
  prior: SupportStatus,
  current: SupportStatus,
  direction: AlignmentDelta["direction"]
): string {
  if (direction === "unchanged") {
    return `${label} remains ${current}.`;
  }

  const priorLabel = SUPPORT_LABEL_MAP[prior];
  const currentLabel = SUPPORT_LABEL_MAP[current];

  if (direction === "improved") {
    return `${label} moved from ${priorLabel} to ${currentLabel}.`;
  }

  return `${label} moved from ${priorLabel} to ${currentLabel}.`;
}

const SUPPORT_LABEL_MAP: Record<SupportStatus, string> = {
  supported: "supported",
  mixed: "mixed signals",
  crowded_out: "under pressure",
  unknown: "not enough data",
};

// ============================================================================
// TENSION SHIFTS
// ============================================================================

function computeTensionShifts(
  previous: CoherenceSnapshot,
  current: CoherenceSnapshot
): TensionShift[] {
  const shifts: TensionShift[] = [];

  for (const curTension of current.tensions) {
    const prevTension = previous.tensions.find((t) => t.id === curTension.id);

    if (!prevTension) {
      // New tension
      shifts.push({
        tension_id: curTension.id,
        intent_anchor: curTension.intent_anchor,
        prior_severity: 0,
        current_severity: curTension.severity,
        direction: "worsened",
        note: `This tension is new — it wasn't present in the previous analysis.`,
      });
      continue;
    }

    const diff = curTension.severity - prevTension.severity;
    const direction: TensionShift["direction"] =
      diff <= -10 ? "eased" : diff >= 10 ? "worsened" : "unchanged";

    shifts.push({
      tension_id: curTension.id,
      intent_anchor: curTension.intent_anchor,
      prior_severity: prevTension.severity,
      current_severity: curTension.severity,
      direction,
      note: buildTensionNote(curTension.intent_anchor, prevTension.severity, curTension.severity, direction),
    });
  }

  // Check for resolved tensions (present before, gone now)
  for (const prevTension of previous.tensions) {
    const stillPresent = current.tensions.find((t) => t.id === prevTension.id);
    if (!stillPresent) {
      shifts.push({
        tension_id: prevTension.id,
        intent_anchor: prevTension.intent_anchor,
        prior_severity: prevTension.severity,
        current_severity: 0,
        direction: "eased",
        note: `This tension is no longer detected in the current data.`,
      });
    }
  }

  return shifts;
}

function buildTensionNote(
  anchor: string,
  priorSeverity: number,
  currentSeverity: number,
  direction: TensionShift["direction"]
): string {
  if (direction === "unchanged") {
    return `The tension around "${anchor}" remains at a similar level (${priorSeverity} → ${currentSeverity}).`;
  }
  if (direction === "eased") {
    return `The tension around "${anchor}" has eased (${priorSeverity} → ${currentSeverity}).`;
  }
  return `The tension around "${anchor}" has increased (${priorSeverity} → ${currentSeverity}).`;
}

// ============================================================================
// STRUCTURAL NOTES
// ============================================================================

function computeStructuralNotes(
  previous: CoherenceSnapshot,
  current: CoherenceSnapshot,
  shifts: TensionShift[]
): string[] {
  const notes: string[] = [];

  // New tensions
  const newTensions = shifts.filter(
    (s) => s.prior_severity === 0 && s.current_severity > 0
  );
  if (newTensions.length > 0) {
    notes.push(
      `${newTensions.length} new tension${newTensions.length > 1 ? "s" : ""} appeared since the last analysis.`
    );
  }

  // Resolved tensions
  const resolved = shifts.filter(
    (s) => s.current_severity === 0 && s.prior_severity > 0
  );
  if (resolved.length > 0) {
    notes.push(
      `${resolved.length} tension${resolved.length > 1 ? "s" : ""} from the previous analysis ${resolved.length > 1 ? "are" : "is"} no longer detected.`
    );
  }

  // Path changes
  const prevPathNames = previous.paths.map((p) => p.name).sort();
  const curPathNames = current.paths.map((p) => p.name).sort();
  if (JSON.stringify(prevPathNames) !== JSON.stringify(curPathNames)) {
    notes.push("The available decision paths have changed — review the updated options.");
  }

  // Confidence changes
  if (previous.confidence.level !== current.confidence.level) {
    notes.push(
      `Overall confidence moved from ${previous.confidence.level} to ${current.confidence.level}.`
    );
  }

  return notes;
}

// ============================================================================
// SUMMARY + DECISION PROMPT
// ============================================================================

function buildDriftSummary(
  alignmentDeltas: AlignmentDelta[],
  tensionShifts: TensionShift[],
  daysBetween: number
): string {
  const improved = alignmentDeltas.filter((d) => d.direction === "improved");
  const declined = alignmentDeltas.filter((d) => d.direction === "declined");
  const eased = tensionShifts.filter((s) => s.direction === "eased");
  const worsened = tensionShifts.filter((s) => s.direction === "worsened");

  const parts: string[] = [];

  if (improved.length > 0) {
    parts.push(
      `${improved.length} value${improved.length > 1 ? "s" : ""} showing stronger support`
    );
  }
  if (declined.length > 0) {
    parts.push(
      `${declined.length} value${declined.length > 1 ? "s" : ""} showing less support`
    );
  }
  if (eased.length > 0) {
    parts.push(`${eased.length} tension${eased.length > 1 ? "s" : ""} eased`);
  }
  if (worsened.length > 0) {
    parts.push(`${worsened.length} tension${worsened.length > 1 ? "s" : ""} increased`);
  }

  if (parts.length === 0) {
    return `Over the past ${daysBetween} days, the overall picture has remained stable.`;
  }

  return `Over the past ${daysBetween} days: ${parts.join(", ")}.`;
}

function buildDecisionPrompt(
  alignmentDeltas: AlignmentDelta[],
  tensionShifts: TensionShift[]
): string {
  // Focus on the most notable change
  const declined = alignmentDeltas.filter((d) => d.direction === "declined");
  const worsened = tensionShifts.filter((s) => s.direction === "worsened");
  const eased = tensionShifts.filter((s) => s.direction === "eased");

  if (declined.length > 0) {
    const top = declined[0];
    return `${top.label} has less support than before — is that something you want to address, or has your focus shifted?`;
  }

  if (worsened.length > 0) {
    const top = worsened[0];
    return `The tension around "${top.intent_anchor}" has increased — is the current path still working for you?`;
  }

  if (eased.length > 0) {
    return "Some tensions have eased — is the current approach worth continuing?";
  }

  return "Things look stable — is there anything you'd like to revisit or adjust?";
}

// ============================================================================
// UTILITIES
// ============================================================================

function computeDaysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.max(0, Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24)));
}
