/**
 * Pressure Translation Layer
 * 
 * Converts technical pressure signals into owner-felt language with actionable templates.
 * This keeps snapshots finite and focused while feeling specific and useful.
 */

import { getIndustryPhrase, pressureKeyToContext, type IndustryBucket } from "../industry";
import { getIndustryGroup, getIndustryGroupFromCohort, type IndustryGroup } from "../industry/industry_groups";
import { GROUP_PRESSURE_TRANSLATIONS, type PressureTranslation as GroupTranslation } from "./group_translations";
import { INDUSTRY_OVERRIDES } from "./industry_overrides";

// Canonical pressure keys (normalized)
export type CanonicalPressureKey =
  | "concentration_risk"
  | "follow_up_drift"
  | "capacity_pressure"
  | "decision_lag"
  | "low_conversion"
  | "rhythm_volatility"
  | "cashflow_drag"
  | "mapping_low_confidence";

// Legacy/alias keys for backward compatibility
export type PressureKey = 
  | CanonicalPressureKey
  | "concentration_high"
  | "capacity_mismatch"
  | "fragility"
  | "capacity_squeeze"
  | "followup_drift";

/**
 * Normalize pressure keys to canonical form
 */
export function normalizePressureKey(key: string): CanonicalPressureKey {
  // Concentration aliases
  if (key === "fragility" || key === "concentration_high" || key === "concentration_risk") {
    return "concentration_risk";
  }
  // Follow-up aliases
  if (key === "followup_drift" || key === "follow_up_drift") {
    return "follow_up_drift";
  }
  // Capacity aliases
  if (key === "capacity_squeeze" || key === "capacity_mismatch" || key === "capacity_pressure") {
    return "capacity_pressure";
  }
  // Return as-is if already canonical (with fallback)
  return (key as CanonicalPressureKey) || "rhythm_volatility";
}

export type PressureTranslation = {
  key: CanonicalPressureKey;
  title: string;
  owner_felt: string[];              // 2-4 plain language lines
  why_templates: string[];           // Causal explanations with {value}, {peer_median}, {percentile} slots
  action_templates: string[];        // 2-4 actionable templates with number slots
  boundary_templates: string[];      // 1-2 boundary conditions
  evidence_hooks: string[];          // snapshot/artifact fields used to quantify
};

export const PRESSURE_TRANSLATIONS: Record<CanonicalPressureKey, PressureTranslation> = {
  concentration_risk: {
    key: "concentration_risk",
    title: "Revenue concentration risk",
    owner_felt: [
      "One project moving can move your whole month",
      "It's hard to plan when a few invoices dominate",
      "You're always chasing the next whale instead of building a base",
    ],
    why_templates: [
      "When top 5 invoices represent {value} of revenue (peer median {peer_median}, {percentile}th percentile), losing one job can swing the whole month.",
      "At {value} concentration vs {peer_median} peer median, planning becomes harder because a single client decision dominates.",
    ],
    action_templates: [
      "Review your top 5 clients: are they repeatable patterns or one-time projects?",
      "Identify 3-5 smaller jobs (${min}–${max}) you turned down that could have smoothed revenue",
      "Set a minimum project size that lets you batch smaller work profitably",
    ],
    boundary_templates: [
      "If your model is high-ticket/low-volume by design (custom luxury work), this concentration is expected. Ensure: deposits collected, milestone billing, 3–6 month pipeline visibility, gap-filler lane for small quick wins.",
      "If concentration above 70%, consider whether one client leaving would force operational changes.",
    ],
    evidence_hooks: ["benchmarks.revenue_concentration_top5_share", "visuals_summary.invoice_size_buckets"],
  },

  follow_up_drift: {
    key: "follow_up_drift",
    title: "Quote follow-up lag",
    owner_felt: [
      "Demand exists, but decisions cool off before they close",
      "You know some quotes would convert with one nudge",
      "Follow-up feels like nagging, so you wait for them to call",
    ],
    why_templates: [
      "With {value} of quotes over 14 days old (peer median {peer_median}, {percentile}th percentile), demand exists but decisions cool off without systematic follow-up.",
      "At {value} aged quotes vs {peer_median} peer median, the issue isn't lead quality—it's conversion timing.",
    ],
    action_templates: [
      "Pull up quotes over 14 days (~{value}) and send a friendly 'just checking in' text",
      "Set 3 calendar reminders per quote: day 3, day 7, day 14",
      "Try one new follow-up line: 'Did I miss answering something?' or 'Still on your radar?'",
    ],
    boundary_templates: [
      "If most quotes are seasonal inquiries without urgency, a light touch is appropriate.",
      "If follow-up is already consistent at 3/7/14 days, the issue may be pricing or lead qualification upstream.",
    ],
    evidence_hooks: ["benchmarks.quote_age_over_14d_share", "visuals_summary.quote_age_buckets"],
  },

  capacity_pressure: {
    key: "capacity_pressure",
    title: "Capacity pressure",
    owner_felt: [
      "The calendar fills, but it doesn't feel controllable",
      "You're either slammed with no breathing room, or slow and worried about cash",
      "Scheduling feels reactive—you never know what next week looks like",
    ],
    why_templates: [
      "With approved→scheduled lag at {value} days (peer median {peer_median}, {percentile}th percentile), work stacks up but doesn't flow cleanly onto the calendar.",
      "At {value} days vs {peer_median} peer median, the bottleneck is usually crew availability or parts timing, not demand.",
    ],
    action_templates: [
      "Protect one calm scheduling pass each week (~{value} days out) so approved work lands cleanly",
      "Assign one person as schedule 'closer' to own the approved→start handoff",
      "Look at last 8 weeks: can you smooth 2-3 jobs from peak weeks into valleys?",
    ],
    boundary_templates: [
      "If your schedule is intentionally full by design (operating at max capacity), this pressure is expected.",
      "If lag is driven by client timing (permits, inspections), focus on milestone communication rather than internal ops.",
    ],
    evidence_hooks: ["benchmarks.approved_to_scheduled_p50_days", "visuals_summary.weekly_volume_series"],
  },

  decision_lag: {
    key: "decision_lag",
    title: "Decision lag",
    owner_felt: [
      "Client says yes, but weeks pass before the job starts",
      "You lose momentum—by the time you show up, priorities have shifted",
    ],
    why_templates: [
      "With quote→job lag at {value} days, approved work sits idle and risks cancellation.",
    ],
    action_templates: [
      "For approved jobs, propose 2 specific dates in the next 7 days (not 'let me know when')",
      "Send a calendar invite immediately after approval to create commitment",
    ],
    boundary_templates: [
      "If delays are client-driven (permits, materials), focus on milestone check-ins rather than internal scheduling.",
    ],
    evidence_hooks: ["benchmarks.approved_to_scheduled_p50_days"],
  },

  low_conversion: {
    key: "low_conversion",
    title: "Low quote conversion",
    owner_felt: [
      "You're quoting a lot but not closing much",
      "Every quote feels like a gamble instead of a likely win",
    ],
    why_templates: [
      "At {value} conversion vs {peer_median} peer median, the issue is usually pricing clarity, scope ambiguity, or weak follow-up.",
    ],
    action_templates: [
      "Review recent 'no' quotes: was it price, timing, or did you never hear back?",
      "Try breaking one quote into 3 tiers: essential, standard, premium",
    ],
    boundary_templates: [
      "If you're quoting exploratory leads (not qualified buyers), low conversion is expected.",
    ],
    evidence_hooks: ["benchmarks.quote_to_job_conversion_rate"],
  },

  rhythm_volatility: {
    key: "rhythm_volatility",
    title: "Revenue rhythm volatility",
    owner_felt: [
      "Some weeks you're making great money, other weeks almost nothing",
      "Planning feels impossible because volume swings so much",
    ],
    why_templates: [
      "With {value} weekly volatility (peer median {peer_median}), revenue swings create cash anxiety and planning friction.",
    ],
    action_templates: [
      "Look at weeks with zero revenue: were you on vacation, or did work dry up?",
      "Identify your 3 most consistent revenue sources and make them more recurring",
    ],
    boundary_templates: [
      "If volatility is seasonal (weather, holidays), smooth with deposits or retainer lanes.",
    ],
    evidence_hooks: ["benchmarks.weekly_volume_volatility_index"],
  },

  cashflow_drag: {
    key: "cashflow_drag",
    title: "Invoice payment lag",
    owner_felt: [
      "You finish the job but wait weeks to get paid",
      "Chasing payments feels awkward, so you wait and hope",
    ],
    why_templates: [
      "With {value} days invoice→paid (peer median {peer_median}, {percentile}th percentile), working capital gets strained even when revenue is good.",
    ],
    action_templates: [
      "Review unpaid invoices over 30 days and send friendly 'just checking' follow-ups today",
      "For next jobs, require 50% upfront or same-day payment (card on file)",
      "Offer 5% discount for payment within 7 days to speed cashflow",
    ],
    boundary_templates: [
      "If you're working with commercial clients with standard NET-30 terms, 30-45 day cycles are typical.",
    ],
    evidence_hooks: ["benchmarks.invoiced_to_paid_p50_days"],
  },

  mapping_low_confidence: {
    key: "mapping_low_confidence",
    title: "Data mapping confidence low",
    owner_felt: [
      "The numbers feel directionally right but not precise",
      "Some dates or linkages might be approximate",
    ],
    why_templates: [
      "When export mapping has gaps, insights are directional but not decision-grade.",
    ],
    action_templates: [
      "Confirm quote→invoice linkage in your system (job IDs or customer names)",
      "Verify date fields are exporting correctly (approved date, scheduled date, invoice date)",
    ],
    boundary_templates: [
      "Do not act on specific numbers until mapping is verified. Use patterns directionally only.",
    ],
    evidence_hooks: ["mapping_confidence"],
  },
};

/**
 * Context for pressure translation
 */
// Import benchmark types for proper context binding
import type { BenchmarkPackV1 } from "../types/decision_artifact";

export type TranslationContext = {
  evidence_summary: string; // Simple evidence summary string
  visuals_summary: string; // Simple visuals summary string
  benchmarks?: BenchmarkPackV1; // Benchmark pack with metrics
  industry?: IndustryBucket | null; // Industry bucket for voice hints
};

/**
 * Bind benchmark template slots with actual values
 */
function bindBenchmarkSlots(template: string, benchmarks?: BenchmarkPackV1, metricKey?: string): string {
  if (!benchmarks || !metricKey) return template;

  const metric = benchmarks.metrics.find((m) => m.key === metricKey);
  if (!metric) return template;

  let bound = template;
  
  // Format value with unit
  const valueStr = metric.unit === "%" 
    ? `${Math.round(metric.value)}%`
    : metric.unit === "days"
    ? `${Math.round(metric.value)} days`
    : `${metric.value.toFixed(2)}`;
  
  const medianStr = metric.unit === "%"
    ? `${Math.round(metric.peer_median)}%`
    : metric.unit === "days"
    ? `${Math.round(metric.peer_median)} days`
    : `${metric.peer_median.toFixed(2)}`;
  
  const percentileStr = `${Math.round(metric.percentile)}`;
  
  bound = bound.replace(/{value}/g, valueStr);
  bound = bound.replace(/{peer_median}/g, medianStr);
  bound = bound.replace(/{percentile}/g, percentileStr);
  
  return bound;
}

/**
 * Translate a pressure key into owner-felt language with context
 */
export function translatePressure(
  key: PressureKey,
  ctx: TranslationContext
): {
  title: string;
  owner_felt_line: string;
  why_line: string;
  action_template: string;
  boundary: string;
  action_suggestions: string[]; // Legacy: for backward compatibility
} {
  // Normalize to canonical key
  const canonicalKey = normalizePressureKey(key);
  const translation = PRESSURE_TRANSLATIONS[canonicalKey];
  
  if (!translation) {
    return {
      title: "Pressure detected",
      owner_felt_line: "Something needs attention.",
      why_line: "Review the data for details.",
      action_template: "Review snapshot details and identify next steps.",
      boundary: "Do not act until patterns stabilize.",
      action_suggestions: ["Review snapshot details and identify next steps."],
    };
  }

  // Try to use industry-specific phrase for owner_felt_line
  const pressureContext = pressureKeyToContext(canonicalKey);
  const industryPhrase = ctx.industry ? getIndustryPhrase(ctx.industry, pressureContext) : null;
  const owner_felt_line = industryPhrase || translation.owner_felt[0];

  // Build why_line with benchmark binding
  let why_line = translation.why_templates?.[0] || "Patterns are emerging from the data.";
  
  // Map pressure keys to benchmark metric keys
  const metricKeyMap: Record<CanonicalPressureKey, string> = {
    concentration_risk: "revenue_concentration_top5_share",
    follow_up_drift: "quote_age_over_14d_share",
    capacity_pressure: "approved_to_scheduled_p50_days",
    cashflow_drag: "invoiced_to_paid_p50_days",
    rhythm_volatility: "weekly_volume_volatility_index",
    low_conversion: "quote_to_job_conversion_rate",
    decision_lag: "approved_to_scheduled_p50_days",
    mapping_low_confidence: "",
  };
  
  const metricKey = metricKeyMap[canonicalKey];
  why_line = bindBenchmarkSlots(why_line, ctx.benchmarks, metricKey);
  
  // Pick best action template
  const action_template = translation.action_templates?.[0] || "Monitor and track patterns.";
  
  // Pick boundary template
  const boundary = translation.boundary_templates?.[0] || "Do not act until patterns stabilize.";

  // Legacy action_suggestions for backward compatibility
  const action_suggestions = translation.action_templates?.slice(0, 2) || [action_template];

  return {
    title: translation.title,
    owner_felt_line,
    why_line,
    action_template,
    boundary,
    action_suggestions,
  };
}

/**
 * Get the most severe pressure from a list
 */
export function getTopPressure(pressureKeys: PressureKey[]): PressureKey | null {
  if (pressureKeys.length === 0) return null;
  
  // Priority order (most severe first)
  const priorityOrder: PressureKey[] = [
    "mapping_low_confidence",
    "cashflow_drag",
    "low_conversion",
    "follow_up_drift",
    "concentration_high",
    "decision_lag",
    "capacity_mismatch",
    "rhythm_volatility",
  ];
  
  for (const key of priorityOrder) {
    if (pressureKeys.includes(key)) return key;
  }
  
  return pressureKeys[0];
}

/**
 * Resolve pressure translation with industry awareness
 * 
 * Resolution order:
 * 1. Named industry override (if exists)
 * 2. IndustryGroup translation
 * 3. Fallback generic
 * 
 * This is the PRIMARY function for getting pressure translations in the new system.
 */
export function resolvePressureTranslation({
  pressure_key,
  industry_key,
  industry_group,
  cohort_label,
}: {
  pressure_key: PressureKey;
  industry_key?: string | null;
  industry_group?: IndustryGroup | null;
  cohort_label?: string;
}): GroupTranslation {
  // Normalize to canonical key
  const canonicalKey = normalizePressureKey(pressure_key);
  
  // 1. Try named industry override first
  if (industry_key) {
    const normalized = industry_key.toLowerCase();
    const override = INDUSTRY_OVERRIDES[normalized]?.[canonicalKey];
    if (override) {
      return override;
    }
  }
  
  // 2. Try IndustryGroup translation
  const group = 
    industry_group ?? 
    (industry_key ? getIndustryGroup(industry_key) : getIndustryGroupFromCohort(cohort_label));
  const groupTranslation = GROUP_PRESSURE_TRANSLATIONS[group]?.[canonicalKey];
  if (groupTranslation) {
    return groupTranslation;
  }
  
  // 3. Fallback generic (should almost never be used)
  return {
    owner_felt_line: "Something needs attention.",
    explanation: "Patterns detected in the data suggest this area warrants review.",
    recommended_move: "Review the data and identify next steps based on your operational knowledge.",
    boundary: "Do not act if this conflicts with your direct operational knowledge.",
  };
}
