import { Band } from "./signal_schema";

export type PatternConclusion = {
  conclusion_version: "conclusion_v1";
  pattern_id: string;
  one_sentence_pattern: string;
  decision: string;
  boundary: string;
  why_this_now: string;
  confidence: "low" | "medium" | "high";
  evidence_signals: string[];
};

export type SignalRule = {
  key: string;
  allowed: string[];
};

export type PatternDefinition = {
  pattern_id: string;
  counter_patterns: string[];
  signature_rules: {
    required: SignalRule[];
    optional: SignalRule[];
  };
  evidence_signal_candidates: string[];
  signature_strength: (signals: Record<string, string>) => number;
  buildConclusion: (params: {
    confidence: "low" | "medium" | "high";
    evidence_signals: string[];
    overlay?: string;
  }) => PatternConclusion;
};

function buildConclusionBase(params: {
  pattern_id: string;
  pattern: string;
  decision: string;
  boundary: string;
  why: string;
  confidence: "low" | "medium" | "high";
  evidence_signals: string[];
}) {
  return {
    conclusion_version: "conclusion_v1",
    pattern_id: params.pattern_id,
    one_sentence_pattern: params.pattern,
    decision: params.decision,
    boundary: params.boundary,
    why_this_now: params.why,
    confidence: params.confidence,
    evidence_signals: params.evidence_signals,
  };
}

export const PATTERNS: PatternDefinition[] = [
  {
    pattern_id: "scheduling_window_pressure",
    counter_patterns: ["admin_load_shadow_work", "quote_followup_drag"],
    signature_rules: {
      required: [
        { key: "schedule.lead_time_p90.band", allowed: ["high"] },
        { key: "schedule.overbook_rate.band", allowed: ["high", "medium"] },
        { key: "schedule.reschedule_14d.band", allowed: ["high", "medium"] },
      ],
      optional: [
        { key: "schedule.no_show_rate.band", allowed: ["high"] },
        { key: "schedule.queue_wait_avg.band", allowed: ["high"] },
      ],
    },
    evidence_signal_candidates: [
      "schedule.lead_time_p90.band",
      "schedule.overbook_rate.band",
      "schedule.reschedule_14d.band",
      "schedule.no_show_rate.band",
      "schedule.queue_wait_avg.band",
    ],
    signature_strength: (signals) =>
      scoreSignature(signals, {
        required: [
          { key: "schedule.lead_time_p90.band", allowed: ["high"] },
          { key: "schedule.overbook_rate.band", allowed: ["high", "medium"] },
          { key: "schedule.reschedule_14d.band", allowed: ["high", "medium"] },
        ],
        optional: [
          { key: "schedule.no_show_rate.band", allowed: ["high"] },
          { key: "schedule.queue_wait_avg.band", allowed: ["high"] },
        ],
      }) / 8,
    buildConclusion: ({ confidence, evidence_signals, overlay }) =>
      buildConclusionBase({
        pattern_id: "scheduling_window_pressure",
        pattern:
          "The schedule window is stretching and reshaping faster than it can absorb new work.",
        decision: "Reset the scheduling window before accepting more lead-time risk.",
        boundary: "Pause new non-urgent bookings until lead time stabilizes.",
        why: overlay
          ? `Lead-time pressure is rising alongside ${overlay}.`
          : "Lead-time and reschedules are stacking in the current window.",
        confidence,
        evidence_signals,
      }),
  },
  {
    pattern_id: "growth_value_drift",
    counter_patterns: ["bad_fit_friction_jobs", "scope_instability_midjob"],
    signature_rules: {
      required: [
        { key: "demand.job_count_trend.band", allowed: ["up"] },
        { key: "demand.avg_ticket_trend.band", allowed: ["down", "flat"] },
        { key: "mix.low_value_job_share.band", allowed: ["high"] },
      ],
      optional: [
        { key: "ops.completion_time_p90.band", allowed: ["high"] },
      ],
    },
    evidence_signal_candidates: [
      "demand.job_count_trend.band",
      "demand.avg_ticket_trend.band",
      "mix.low_value_job_share.band",
      "ops.completion_time_p90.band",
    ],
    signature_strength: (signals) =>
      scoreSignature(signals, {
        required: [
          { key: "demand.job_count_trend.band", allowed: ["up"] },
          { key: "demand.avg_ticket_trend.band", allowed: ["down", "flat"] },
          { key: "mix.low_value_job_share.band", allowed: ["high"] },
        ],
        optional: [
          { key: "ops.completion_time_p90.band", allowed: ["high"] },
        ],
      }) / 7,
    buildConclusion: ({ confidence, evidence_signals, overlay }) =>
      buildConclusionBase({
        pattern_id: "growth_value_drift",
        pattern:
          "Volume is rising while the average job is worth less or takes longer to finish.",
        decision: "Protect the value floor before volume sets the pace.",
        boundary: "Decline low-value work that stretches completion time.",
        why: overlay
          ? `Value drift is landing during ${overlay}.`
          : "Ticket size is not keeping pace with rising volume.",
        confidence,
        evidence_signals,
      }),
  },
  {
    pattern_id: "quote_followup_drag",
    counter_patterns: ["admin_load_shadow_work", "scheduling_window_pressure"],
    signature_rules: {
      required: [
        { key: "pipeline.open_quotes.band", allowed: ["high"] },
        { key: "pipeline.quote_age_p90.band", allowed: ["high", "medium"] },
      ],
      optional: [
        { key: "demand.job_count_trend.band", allowed: ["flat", "down"] },
      ],
    },
    evidence_signal_candidates: [
      "pipeline.open_quotes.band",
      "pipeline.quote_age_p90.band",
      "demand.job_count_trend.band",
    ],
    signature_strength: (signals) =>
      scoreSignature(signals, {
        required: [
          { key: "pipeline.open_quotes.band", allowed: ["high"] },
          { key: "pipeline.quote_age_p90.band", allowed: ["high", "medium"] },
        ],
        optional: [
          { key: "demand.job_count_trend.band", allowed: ["flat", "down"] },
        ],
      }) / 5,
    buildConclusion: ({ confidence, evidence_signals, overlay }) =>
      buildConclusionBase({
        pattern_id: "quote_followup_drag",
        pattern:
          "Quotes are piling up and aging, pulling attention away from new demand.",
        decision: "Clear the quote backlog before opening more follow-up loops.",
        boundary: "Stop creating new quote threads until the oldest are resolved.",
        why: overlay
          ? `Quote drag is heavier during ${overlay}.`
          : "Open quotes are aging faster than they resolve.",
        confidence,
        evidence_signals,
      }),
  },
  {
    pattern_id: "cash_timing_stretch",
    counter_patterns: ["growth_value_drift", "bad_fit_friction_jobs"],
    signature_rules: {
      required: [
        { key: "cash.days_to_paid_p90.band", allowed: ["high"] },
        { key: "cash.late_rate.band", allowed: ["high", "medium"] },
      ],
      optional: [
        { key: "cash.dispute_rate.band", allowed: ["high"] },
      ],
    },
    evidence_signal_candidates: [
      "cash.days_to_paid_p90.band",
      "cash.late_rate.band",
      "cash.dispute_rate.band",
    ],
    signature_strength: (signals) =>
      scoreSignature(signals, {
        required: [
          { key: "cash.days_to_paid_p90.band", allowed: ["high"] },
          { key: "cash.late_rate.band", allowed: ["high", "medium"] },
        ],
        optional: [
          { key: "cash.dispute_rate.band", allowed: ["high"] },
        ],
      }) / 5,
    buildConclusion: ({ confidence, evidence_signals, overlay }) =>
      buildConclusionBase({
        pattern_id: "cash_timing_stretch",
        pattern:
          "Cash timing is stretching beyond the pace the work is delivered.",
        decision: "Tighten payment timing before it slips further.",
        boundary: "Hold new starts that don’t meet current payment timing.",
        why: overlay
          ? `Payment stretch is more visible during ${overlay}.`
          : "Late timing is widening past the current buffer.",
        confidence,
        evidence_signals,
      }),
  },
  {
    pattern_id: "scope_instability_midjob",
    counter_patterns: ["bad_fit_friction_jobs", "growth_value_drift"],
    signature_rules: {
      required: [
        { key: "ops.change_orders_rate.band", allowed: ["high"] },
        { key: "ops.completion_time_p90.band", allowed: ["high", "medium"] },
      ],
      optional: [
        { key: "ops.rework_rate.band", allowed: ["high"] },
      ],
    },
    evidence_signal_candidates: [
      "ops.change_orders_rate.band",
      "ops.completion_time_p90.band",
      "ops.rework_rate.band",
    ],
    signature_strength: (signals) =>
      scoreSignature(signals, {
        required: [
          { key: "ops.change_orders_rate.band", allowed: ["high"] },
          { key: "ops.completion_time_p90.band", allowed: ["high", "medium"] },
        ],
        optional: [
          { key: "ops.rework_rate.band", allowed: ["high"] },
        ],
      }) / 5,
    buildConclusion: ({ confidence, evidence_signals, overlay }) =>
      buildConclusionBase({
        pattern_id: "scope_instability_midjob",
        pattern:
          "Scope shifts mid-job are lengthening completion and creating rework.",
        decision: "Lock scope earlier to protect completion time.",
        boundary: "Pause any mid-job additions until scope is re-confirmed.",
        why: overlay
          ? `Scope pressure is showing up alongside ${overlay}.`
          : "Change orders are stretching completion time.",
        confidence,
        evidence_signals,
      }),
  },
  {
    pattern_id: "bad_fit_friction_jobs",
    counter_patterns: ["growth_value_drift", "scope_instability_midjob"],
    signature_rules: {
      required: [
        { key: "mix.high_effort_low_margin.band", allowed: ["high"] },
        { key: "ops.rework_rate.band", allowed: ["high", "medium"] },
      ],
      optional: [
        { key: "demand.avg_ticket_trend.band", allowed: ["down"] },
      ],
    },
    evidence_signal_candidates: [
      "mix.high_effort_low_margin.band",
      "ops.rework_rate.band",
      "demand.avg_ticket_trend.band",
    ],
    signature_strength: (signals) =>
      scoreSignature(signals, {
        required: [
          { key: "mix.high_effort_low_margin.band", allowed: ["high"] },
          { key: "ops.rework_rate.band", allowed: ["high", "medium"] },
        ],
        optional: [
          { key: "demand.avg_ticket_trend.band", allowed: ["down"] },
        ],
      }) / 5,
    buildConclusion: ({ confidence, evidence_signals, overlay }) =>
      buildConclusionBase({
        pattern_id: "bad_fit_friction_jobs",
        pattern:
          "High-effort jobs are returning lower value and triggering rework.",
        decision: "Say no sooner to low-fit jobs before they consume capacity.",
        boundary: "Decline work that requires repeated adjustments for low payoff.",
        why: overlay
          ? `Fit friction is showing up during ${overlay}.`
          : "Rework is clustering around low-fit jobs.",
        confidence,
        evidence_signals,
      }),
  },
  {
    pattern_id: "admin_load_shadow_work",
    counter_patterns: ["quote_followup_drag", "scheduling_window_pressure"],
    signature_rules: {
      required: [
        { key: "pipeline.open_quotes.band", allowed: ["high"] },
        { key: "schedule.reschedule_14d.band", allowed: ["high", "medium"] },
      ],
      optional: [
        { key: "ops.completion_time_p90.band", allowed: ["high"] },
      ],
    },
    evidence_signal_candidates: [
      "pipeline.open_quotes.band",
      "schedule.reschedule_14d.band",
      "ops.completion_time_p90.band",
    ],
    signature_strength: (signals) =>
      scoreSignature(signals, {
        required: [
          { key: "pipeline.open_quotes.band", allowed: ["high"] },
          { key: "schedule.reschedule_14d.band", allowed: ["high", "medium"] },
        ],
        optional: [
          { key: "ops.completion_time_p90.band", allowed: ["high"] },
        ],
      }) / 5,
    buildConclusion: ({ confidence, evidence_signals, overlay }) =>
      buildConclusionBase({
        pattern_id: "admin_load_shadow_work",
        pattern:
          "Admin work is expanding quietly as quotes and reschedules stack.",
        decision: "Shrink admin loops before they take more build time.",
        boundary: "Stop adding new admin tasks until backlog clears.",
        why: overlay
          ? `Admin load is rising alongside ${overlay}.`
          : "Quotes and reschedules are stacking into admin time.",
        confidence,
        evidence_signals,
      }),
  },
  {
    pattern_id: "low_impact_boundary",
    counter_patterns: [],
    signature_rules: {
      required: [],
      optional: [],
    },
    evidence_signal_candidates: [
      "crew_capacity.band",
      "seasonality.band",
      "job_mix.band",
    ],
    signature_strength: () => 0,
    buildConclusion: ({ confidence, evidence_signals }) =>
      buildConclusionBase({
        pattern_id: "low_impact_boundary",
        pattern: "Signals are mixed and no single pressure dominates yet.",
        decision: "Hold a small boundary while signals clarify.",
        boundary: "Protect a small buffer until a clearer pattern appears.",
        why: "No single signal is strong enough to justify a larger move.",
        confidence,
        evidence_signals,
      }),
  },
];

export function scoreSignature(
  signals: Record<string, string>,
  rules: PatternDefinition["signature_rules"]
) {
  let score = 0;
  for (const rule of rules.required) {
    if (rule.allowed.includes(signals[rule.key])) {
      score += 2;
    }
  }
  for (const rule of rules.optional) {
    if (rule.allowed.includes(signals[rule.key])) {
      score += 1;
    }
  }
  return score;
}

export function confidenceForPattern(score: number) {
  if (score >= 6) return "high" as const;
  if (score >= 4) return "medium" as const;
  return "low" as const;
}
