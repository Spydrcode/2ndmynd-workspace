/**
 * value_alignment.ts — Value-Prop Alignment for the Coherence Engine
 *
 * REUSE DOCTRINE:
 * - Uses existing intent.value_confidence[] as the baseline for declared/behavioral/refusal/score/confidence.
 * - Does NOT recompute those — only adds support classification, pressure detection, and evidence bullets.
 *
 * Structure:
 * - computeValuePropAlignment({ intent, reality_signals }) → ValuePropAlignment[]
 * - derivePressureIndex(signals) → pressure analysis for crowded_out classification
 *
 * FORBIDDEN:
 * - No benchmarking language, no comparisons, no judgment.
 * - Pricing advice is gated.
 */

import type {
  OwnerIntentModel,
  RealitySignal,
  IntentConfidence,
  SupportStatus,
  ValuePropAlignment,
} from "../types/coherence_engine";
import { FORBIDDEN_WORDS } from "./language_guardrails";

// ============================================================================
// HUMAN-READABLE LABEL MAPPER
// ============================================================================

const VALUE_PROP_LABEL_MAP: Record<string, string> = {
  speed_responsiveness: "Fast response",
  affordability: "Fair pricing",
  clarity_communication: "Clear communication",
  safety_compliance: "Safety & compliance",
  premium_quality: "Premium quality",
  availability_when_others_wont: "Available when others aren't",
  local_trust: "Local trust",
  convenience_low_hassle: "Low hassle / convenience",
  relationship_care: "Relationship-driven care",
  other_custom: "Custom value proposition",
};

export function valuePropLabel(tag: string): string {
  return VALUE_PROP_LABEL_MAP[tag] ?? tag.replace(/_/g, " ");
}

// ============================================================================
// PRESSURE INDEX — detects signals that crowd out value props
// ============================================================================

/**
 * Pressure signals that can crowd out value props.
 * Each pressure is associated with specific signals and affects certain value props.
 */
type PressureIndicator = {
  id: string;
  signal_ids: string[];
  check: (signals: RealitySignal[]) => boolean;
  affects_tags: string[];
  description: string;
};

const PRESSURE_INDICATORS: PressureIndicator[] = [
  {
    id: "owner_bottleneck",
    signal_ids: ["sig_owner_dependency_owner_only", "sig_capacity_demand_exceeds_capacity"],
    check: (sigs) => {
      const dep = sigs.find((s) => s.id.includes("owner") && s.id.includes("dependency"));
      const cap = sigs.find((s) => s.id.includes("capacity"));
      return (dep?.magnitude ?? 0) >= 60 || (cap?.magnitude ?? 0) >= 60;
    },
    affects_tags: ["speed_responsiveness", "clarity_communication", "convenience_low_hassle"],
    description: "Owner bottleneck — too much flows through one person",
  },
  {
    id: "scheduling_chaos",
    signal_ids: ["sig_rhythm_volatility", "sig_timing_decision_lag"],
    check: (sigs) => {
      const vol = sigs.find((s) => s.id === "sig_rhythm_volatility");
      const lag = sigs.find((s) => s.id === "sig_timing_decision_lag");
      return (vol?.magnitude ?? 0) >= 65 || (lag?.magnitude ?? 0) >= 65;
    },
    affects_tags: ["speed_responsiveness", "clarity_communication", "premium_quality"],
    description: "Scheduling chaos — unpredictable rhythm makes consistency hard",
  },
  {
    id: "communication_overload",
    signal_ids: ["sig_capacity_demand_exceeds_capacity", "sig_timing_decision_lag"],
    check: (sigs) => {
      const cap = sigs.find((s) => s.id.includes("capacity"));
      const lag = sigs.find((s) => s.id === "sig_timing_decision_lag");
      return (cap?.magnitude ?? 0) >= 50 && (lag?.magnitude ?? 0) >= 50;
    },
    affects_tags: ["clarity_communication", "relationship_care"],
    description: "Communication load — capacity strain delays responses",
  },
  {
    id: "cashflow_gaps",
    signal_ids: ["sig_cash_revenue_concentration", "sig_concentration_customer"],
    check: (sigs) => {
      const cash = sigs.find((s) => s.id.includes("cash") || s.id.includes("revenue"));
      const conc = sigs.find((s) => s.id.includes("concentration"));
      return (cash?.magnitude ?? 0) >= 60 || (conc?.magnitude ?? 0) >= 70;
    },
    affects_tags: ["affordability", "premium_quality"],
    description: "Cash flow dependency — revenue concentration creates pressure",
  },
  {
    id: "compliance_overstrain",
    signal_ids: ["sig_capacity_demand_exceeds_capacity"],
    check: (sigs) => {
      const cap = sigs.find((s) => s.id.includes("capacity"));
      return (cap?.magnitude ?? 0) >= 70;
    },
    affects_tags: ["safety_compliance"],
    description: "Compliance pressure — capacity strain risks shortcuts",
  },
];

export type PressureIndex = {
  pressures: Array<{
    id: string;
    active: boolean;
    affects_tags: string[];
    description: string;
  }>;
  crowded_tags: Set<string>;
};

/**
 * Derive pressure index from reality signals.
 * Returns a list of active pressures and which tags they crowd out.
 */
export function derivePressureIndex(signals: RealitySignal[]): PressureIndex {
  const pressures = PRESSURE_INDICATORS.map((p) => ({
    id: p.id,
    active: p.check(signals),
    affects_tags: p.affects_tags,
    description: p.description,
  }));

  const crowded_tags = new Set<string>();
  for (const p of pressures) {
    if (p.active) {
      for (const tag of p.affects_tags) {
        crowded_tags.add(tag);
      }
    }
  }

  return { pressures, crowded_tags };
}

/**
 * Find pressure signal_ids that affect a specific value tag.
 * Returns the signal_ids from active pressure indicators that crowd the tag.
 */
function findPressureSignalIds(
  tag: string,
  signals: RealitySignal[],
  pressureIndex: PressureIndex
): string[] {
  const pressureSignalIds: string[] = [];

  for (const p of PRESSURE_INDICATORS) {
    // Only consider pressures that affect this tag and are active
    if (!p.affects_tags.includes(tag)) continue;
    if (!p.check(signals)) continue;

    // Find the actual signals that triggered this pressure
    for (const expectedId of p.signal_ids) {
      const found = signals.find(
        (s) => s.id === expectedId || s.id.includes(expectedId.replace("sig_", ""))
      );
      if (found && !pressureSignalIds.includes(found.id)) {
        pressureSignalIds.push(found.id);
      }
    }
  }

  return pressureSignalIds;
}

// ============================================================================
// GENTLE CHECK PROMPTS (decision-safe format per spec)
// ============================================================================

const GENTLE_CHECKS: Record<string, string> = {
  speed_responsiveness:
    "Quick check: is fast response a promise you want to protect — or has the priority shifted?",
  affordability:
    "Quick check: is fair pricing a promise you want to protect — or does something feel off about current pricing?",
  clarity_communication:
    "Quick check: is clear communication a promise you want to protect — are customers getting that message?",
  safety_compliance:
    "Quick check: is safety compliance driven by conviction — or by external pressure right now?",
  premium_quality:
    "Quick check: is premium quality a promise you can still protect — given current workload?",
  availability_when_others_wont:
    "Quick check: is being available when others aren't worth the personal cost it takes?",
  local_trust:
    "Quick check: are repeat customers still the engine — or is that relationship shifting?",
  convenience_low_hassle:
    "Quick check: is low hassle what you're delivering — or has friction crept in?",
  relationship_care:
    "Quick check: do you still feel connected to your customers — or is it getting transactional?",
  other_custom:
    "Quick check: is your unique value still the core of what makes you different?",
};

// ============================================================================
// FORBIDDEN LANGUAGE GUARD
// ============================================================================

export function assertNoForbiddenLanguage(text: string): void {
  for (const pattern of FORBIDDEN_WORDS) {
    if (pattern.test(text)) {
      throw new Error(
        `Forbidden language detected in alignment output: "${text}" matched ${pattern}`
      );
    }
  }
}

// ============================================================================
// MAIN FUNCTION: computeValuePropAlignment
// ============================================================================

export type ComputeValuePropAlignmentInput = {
  intent: OwnerIntentModel;
  reality_signals: RealitySignal[];
};

/**
 * Compute value-prop alignment by REUSING intent.value_confidence[].
 *
 * - Does NOT recompute declared/behavioral/refusal/score/confidence.
 * - Adds support classification using pressure index.
 * - Builds evidence with { signal_ids, bullets }.
 * - Applies gentle checks and forbidden language guard.
 */
export function computeValuePropAlignment(
  input: ComputeValuePropAlignmentInput
): ValuePropAlignment[] {
  const { intent, reality_signals } = input;

  // If no value_confidence data, fall back to building from value_proposition tags
  const valueConfidenceData = intent.value_confidence ?? [];

  // Derive pressure index for crowded_out detection
  const pressureIndex = derivePressureIndex(reality_signals);

  // If we have value_confidence data, use it directly
  if (valueConfidenceData.length > 0) {
    const alignments = valueConfidenceData.map((vc) =>
      buildAlignmentFromValueConfidence(vc, intent, reality_signals, pressureIndex)
    );
    // Sort: supported first, then mixed, then crowded_out, then unknown
    alignments.sort((a, b) => SUPPORT_ORDER[a.support] - SUPPORT_ORDER[b.support]);
    return alignments;
  }

  // Fallback for legacy v2 intents without value_confidence
  return buildAlignmentFromLegacyIntent(intent, reality_signals, pressureIndex);
}

const SUPPORT_ORDER: Record<SupportStatus, number> = {
  supported: 0,
  mixed: 1,
  crowded_out: 2,
  unknown: 3,
};

// ============================================================================
// BUILD ALIGNMENT FROM value_confidence[] (V3 path)
// ============================================================================

type ValueConfidenceEntry = NonNullable<OwnerIntentModel["value_confidence"]>[0];

function buildAlignmentFromValueConfidence(
  vc: ValueConfidenceEntry,
  intent: OwnerIntentModel,
  signals: RealitySignal[],
  pressureIndex: PressureIndex
): ValuePropAlignment {
  const { tag, score, confidence, sources } = vc;
  const label = valuePropLabel(tag);

  // Determine support status
  let support = classifySupportFromConfidence(tag, sources, pressureIndex);

  // Build evidence with signal_ids and bullets
  const evidence = buildEvidence(tag, label, sources, signals);

  // Enforce: crowded_out MUST have pressure signal evidence, else downgrade to mixed
  let pressureSignals: string[] = [];
  if (support === "crowded_out") {
    pressureSignals = findPressureSignalIds(tag, signals, pressureIndex);
    if (pressureSignals.length === 0) {
      // No pressure evidence — downgrade to mixed
      support = "mixed";
    } else {
      // Merge pressure signal_ids into evidence
      for (const id of pressureSignals) {
        if (!evidence.signal_ids.includes(id)) {
          evidence.signal_ids.push(id);
        }
      }
    }
  }

  // Gentle check for low-confidence, crowded_out, or mixed
  let gentle_check: string | undefined;
  if (confidence === "low" || support === "crowded_out" || support === "mixed") {
    gentle_check = GENTLE_CHECKS[tag];
  }

  // Notes for debugging
  const notes = [
    `declared=${sources.declared}`,
    `behavioral=${sources.behavioral}`,
    `refusal=${sources.refusal}`,
    `score=${score}/3`,
    `pressure_crowded=${pressureIndex.crowded_tags.has(tag)}`,
  ];
  if (pressureSignals.length > 0) {
    notes.push(`pressure_signals=${pressureSignals.join(",")}`);
  }
  if (vc.notes) {
    notes.push(...vc.notes);
  }

  const result: ValuePropAlignment = {
    tag,
    label,
    confidence,
    sources,
    score,
    support,
    evidence,
    ...(gentle_check ? { gentle_check } : {}),
    notes,
  };

  // Guard against forbidden language
  for (const bullet of result.evidence.bullets) {
    assertNoForbiddenLanguage(bullet);
  }
  if (result.gentle_check) {
    assertNoForbiddenLanguage(result.gentle_check);
  }

  return result;
}

// ============================================================================
// SUPPORT CLASSIFICATION
// ============================================================================

function classifySupportFromConfidence(
  tag: string,
  sources: ValueConfidenceEntry["sources"],
  pressureIndex: PressureIndex
): SupportStatus {
  const { declared, behavioral, refusal } = sources;

  // If no data at all, unknown
  if (!declared && behavioral === "unknown" && !refusal) {
    return "unknown";
  }

  // If pressure is crowding this tag AND behavioral doesn't clearly support it
  if (pressureIndex.crowded_tags.has(tag) && behavioral !== true) {
    return "crowded_out";
  }

  // If declared but behavioral contradicts it
  if (declared && behavioral === false) {
    return "crowded_out";
  }

  // Count aligned sources
  let alignedCount = 0;
  if (declared) alignedCount++;
  if (behavioral === true) alignedCount++;
  if (refusal) alignedCount++;

  // If 2+ sources align, supported
  if (alignedCount >= 2) {
    return "supported";
  }

  // Single source or unknown behavioral
  if (behavioral === "unknown" && (declared || refusal)) {
    return "mixed";
  }

  // Behavioral false without declaration
  if (behavioral === false && !declared) {
    return "crowded_out";
  }

  // Single-source alignment
  if (alignedCount === 1) {
    return "mixed";
  }

  return "unknown";
}

// ============================================================================
// BEHAVIORAL EVIDENCE EVALUATION (for legacy path)
// ============================================================================

type BehavioralEvaluator = {
  signal_ids: string[];
  evaluate: (signals: RealitySignal[]) => boolean | "unknown";
};

const BEHAVIORAL_EVALUATORS: Record<string, BehavioralEvaluator> = {
  speed_responsiveness: {
    signal_ids: ["sig_timing_decision_lag", "sig_volume_approval_rate"],
    evaluate: (sigs) => {
      const lag = sigs.find((s) => s.id === "sig_timing_decision_lag");
      if (!lag) return "unknown";
      return lag.magnitude < 55;
    },
  },
  affordability: {
    signal_ids: ["sig_volume_invoices", "sig_volume_approval_rate"],
    evaluate: (sigs) => {
      const inv = sigs.find((s) => s.id === "sig_volume_invoices");
      if (!inv) return "unknown";
      const approval = sigs.find((s) => s.id === "sig_volume_approval_rate");
      return inv.magnitude >= 30 && (!approval || approval.magnitude < 50);
    },
  },
  clarity_communication: {
    signal_ids: ["sig_timing_decision_lag", "sig_volume_approval_rate"],
    evaluate: (sigs) => {
      const lag = sigs.find((s) => s.id === "sig_timing_decision_lag");
      const approval = sigs.find((s) => s.id === "sig_volume_approval_rate");
      if (!lag && !approval) return "unknown";
      return (!lag || lag.magnitude < 55) && (!approval || approval.magnitude < 50);
    },
  },
  safety_compliance: {
    signal_ids: ["sig_capacity_demand_exceeds_capacity"],
    evaluate: (sigs) => {
      const cap = sigs.find((s) => s.id.includes("capacity"));
      if (!cap) return "unknown";
      return cap.magnitude < 60;
    },
  },
  premium_quality: {
    signal_ids: ["sig_volume_invoices"],
    evaluate: (sigs) => {
      const inv = sigs.find((s) => s.id === "sig_volume_invoices");
      if (!inv) return "unknown";
      return inv.magnitude <= 60;
    },
  },
  availability_when_others_wont: {
    signal_ids: ["sig_rhythm_volatility"],
    evaluate: (sigs) => {
      const vol = sigs.find((s) => s.id === "sig_rhythm_volatility");
      if (!vol) return "unknown";
      return vol.magnitude >= 50;
    },
  },
  local_trust: {
    signal_ids: ["sig_concentration_customer"],
    evaluate: (sigs) => {
      const conc = sigs.find((s) => s.id.includes("concentration"));
      if (!conc) return "unknown";
      return conc.magnitude >= 40;
    },
  },
  convenience_low_hassle: {
    signal_ids: ["sig_volume_approval_rate", "sig_timing_decision_lag"],
    evaluate: (sigs) => {
      const approval = sigs.find((s) => s.id === "sig_volume_approval_rate");
      const lag = sigs.find((s) => s.id === "sig_timing_decision_lag");
      if (!approval && !lag) return "unknown";
      return (!approval || approval.magnitude < 50) && (!lag || lag.magnitude < 55);
    },
  },
  relationship_care: {
    signal_ids: ["sig_concentration_customer"],
    evaluate: (sigs) => {
      const conc = sigs.find((s) => s.id.includes("concentration"));
      if (!conc) return "unknown";
      return conc.magnitude >= 35;
    },
  },
  other_custom: {
    signal_ids: [],
    evaluate: () => "unknown",
  },
};

// ============================================================================
// EVIDENCE BUILDING (with signal_ids)
// ============================================================================

/**
 * Map tags to the primary signal IDs that provide behavioral evidence.
 */
const TAG_SIGNAL_MAP: Record<string, string[]> = {
  speed_responsiveness: ["sig_timing_decision_lag", "sig_volume_approval_rate"],
  affordability: ["sig_volume_invoices", "sig_volume_approval_rate"],
  clarity_communication: ["sig_timing_decision_lag", "sig_volume_approval_rate"],
  safety_compliance: ["sig_capacity_demand_exceeds_capacity"],
  premium_quality: ["sig_volume_invoices"],
  availability_when_others_wont: ["sig_rhythm_volatility"],
  local_trust: ["sig_concentration_customer"],
  convenience_low_hassle: ["sig_volume_approval_rate", "sig_timing_decision_lag"],
  relationship_care: ["sig_concentration_customer"],
  other_custom: [],
};

function buildEvidence(
  tag: string,
  label: string,
  sources: ValueConfidenceEntry["sources"],
  signals: RealitySignal[]
): ValuePropAlignment["evidence"] {
  const bullets: string[] = [];
  const expectedSignalIds = TAG_SIGNAL_MAP[tag] ?? [];
  const signal_ids = signals
    .filter((s) => expectedSignalIds.some((id) => s.id === id || s.id.includes(id.replace("sig_", ""))))
    .map((s) => s.id);

  // Declared evidence
  if (sources.declared) {
    bullets.push(`You selected "${label}" as part of your value proposition.`);
  }

  // Behavioral evidence
  if (sources.behavioral === true) {
    bullets.push(`Your data patterns are consistent with delivering on "${label}".`);
  } else if (sources.behavioral === false) {
    bullets.push(
      `Your data patterns suggest "${label}" may be under pressure — this doesn't mean it's absent, just that the numbers create friction.`
    );
  } else {
    bullets.push(
      `We don't have enough data to confirm or deny "${label}" behaviorally — it's listed because you said it matters.`
    );
  }

  // Refusal evidence
  if (sources.refusal) {
    bullets.push(
      `Your stated boundaries reinforce "${label}" — you've drawn lines that protect this value.`
    );
  }

  return { signal_ids, bullets };
}

// ============================================================================
// LEGACY FALLBACK (for V2 intents without value_confidence)
// ============================================================================

const PRIORITY_IMPLIES: Record<string, string[]> = {
  profit_margin: ["affordability", "premium_quality"],
  "Healthy profit margins": ["affordability", "premium_quality"],
  predictability_stability: ["local_trust", "relationship_care"],
  "Predictable, steady work": ["local_trust", "relationship_care"],
  safety_compliance: ["safety_compliance"],
  "Safety and regulatory compliance": ["safety_compliance"],
  customer_experience: ["clarity_communication", "relationship_care", "convenience_low_hassle"],
  "Great customer experience": ["clarity_communication", "relationship_care", "convenience_low_hassle"],
  speed_throughput: ["speed_responsiveness"],
  "Fast throughput — jobs flowing smoothly": ["speed_responsiveness"],
  craftsmanship_quality: ["premium_quality"],
  "Craftsmanship and quality of work": ["premium_quality"],
  low_stress_owner: ["convenience_low_hassle"],
  "Less stress for me personally": ["convenience_low_hassle"],
  time_freedom: ["convenience_low_hassle"],
  "More time freedom / better hours": ["convenience_low_hassle"],
  reputation_trust: ["local_trust", "relationship_care", "premium_quality"],
  "Strong reputation and trust": ["local_trust", "relationship_care", "premium_quality"],
  growth_scale: ["availability_when_others_wont", "affordability"],
  "Growing the business / scaling up": ["availability_when_others_wont", "affordability"],
};

const NN_IMPLIES: Record<string, string[]> = {
  no_safety_compromise: ["safety_compliance"],
  "No compromising on safety": ["safety_compliance"],
  no_quality_compromise: ["premium_quality"],
  "No cutting corners on quality": ["premium_quality"],
  keep_prices_fair: ["affordability"],
  "Keep our prices fair": ["affordability"],
  protect_reputation: ["local_trust", "relationship_care"],
  "Protect our reputation above all": ["local_trust", "relationship_care"],
  no_pushy_sales: ["relationship_care", "clarity_communication"],
  "No pushy sales tactics": ["relationship_care", "clarity_communication"],
  follow_regulations_strictly: ["safety_compliance"],
  "Follow all regulations strictly": ["safety_compliance"],
};

const ANTI_GOAL_IMPLIES: Record<string, string[]> = {
  dont_raise_prices_aggressively: ["affordability"],
  "Don't raise prices aggressively": ["affordability"],
  dont_upsell_unneeded: ["relationship_care", "clarity_communication"],
  "Don't upsell things customers don't need": ["relationship_care", "clarity_communication"],
  dont_accept_high_risk_jobs: ["safety_compliance"],
  "Don't accept high-risk jobs": ["safety_compliance"],
  dont_chase_growth_at_all_costs: ["relationship_care", "premium_quality"],
  "Don't chase growth at all costs": ["relationship_care", "premium_quality"],
};

/**
 * Build alignments from legacy V2 intent that doesn't have value_confidence[].
 * This path computes everything from scratch (similar to old infer_value_prop_alignment).
 */
function buildAlignmentFromLegacyIntent(
  intent: OwnerIntentModel,
  signals: RealitySignal[],
  pressureIndex: PressureIndex
): ValuePropAlignment[] {
  // Collect all unique value-prop tags
  const declaredTags = new Set<string>(intent.value_proposition.tags);

  // Discover implied tags from priorities, non-negotiables, anti-goals
  for (const p of intent.priorities_ranked) {
    const implied = PRIORITY_IMPLIES[p];
    if (implied) implied.forEach((t) => declaredTags.add(t));
  }
  for (const nn of intent.non_negotiables) {
    const implied = NN_IMPLIES[nn];
    if (implied) implied.forEach((t) => declaredTags.add(t));
  }

  const alignments: ValuePropAlignment[] = [];

  for (const tag of declaredTags) {
    const alignment = evaluateLegacyTag(tag, intent, signals, pressureIndex);
    alignments.push(alignment);
  }

  alignments.sort((a, b) => SUPPORT_ORDER[a.support] - SUPPORT_ORDER[b.support]);

  return alignments;
}

function evaluateLegacyTag(
  tag: string,
  intent: OwnerIntentModel,
  signals: RealitySignal[],
  pressureIndex: PressureIndex
): ValuePropAlignment {
  const label = valuePropLabel(tag);

  // Declared evidence
  const declared = intent.value_proposition.tags.includes(tag);

  // Behavioral evidence — use evaluators for proper signal-based evaluation
  const evaluator = BEHAVIORAL_EVALUATORS[tag];
  let behavioral: boolean | "unknown" = "unknown";
  if (evaluator) {
    const relevantSignals = signals.filter((s) =>
      evaluator.signal_ids.some((id) => s.id === id || s.id.includes(id.replace("sig_", "")))
    );
    if (relevantSignals.length > 0) {
      behavioral = evaluator.evaluate(relevantSignals);
    }
  }
  // Override with crowded_out if pressure detected
  if (pressureIndex.crowded_tags.has(tag) && behavioral === "unknown") {
    behavioral = false;
  }

  // Refusal evidence
  let refusal = false;
  for (const ag of intent.anti_goals) {
    if (ANTI_GOAL_IMPLIES[ag]?.includes(tag)) refusal = true;
  }
  for (const nn of intent.non_negotiables) {
    if (NN_IMPLIES[nn]?.includes(tag)) refusal = true;
  }

  // Score
  let score = 0;
  if (declared) score++;
  if (behavioral === true) score++;
  if (refusal) score++;

  // Confidence
  let confidence: IntentConfidence = "low";
  if (score >= 2) confidence = "high";
  else if (score >= 1) confidence = "med";

  // Support
  let support = classifySupportFromConfidence(tag, { declared, behavioral, refusal }, pressureIndex);

  // Evidence
  const evidence = buildEvidence(tag, label, { declared, behavioral, refusal }, signals);

  // Enforce: crowded_out MUST have pressure signal evidence, else downgrade to mixed
  let pressureSignals: string[] = [];
  if (support === "crowded_out") {
    pressureSignals = findPressureSignalIds(tag, signals, pressureIndex);
    if (pressureSignals.length === 0) {
      support = "mixed";
    } else {
      for (const id of pressureSignals) {
        if (!evidence.signal_ids.includes(id)) {
          evidence.signal_ids.push(id);
        }
      }
    }
  }

  // Gentle check
  let gentle_check: string | undefined;
  if (confidence === "low" || support === "crowded_out" || support === "mixed") {
    gentle_check = GENTLE_CHECKS[tag];
  }

  const notes = [
    `declared=${declared}`,
    `behavioral=${behavioral}`,
    `refusal=${refusal}`,
    `score=${score}/3`,
    `legacy_fallback=true`,
  ];
  if (pressureSignals.length > 0) {
    notes.push(`pressure_signals=${pressureSignals.join(",")}`);
  }

  const result: ValuePropAlignment = {
    tag,
    label,
    confidence,
    sources: { declared, behavioral, refusal },
    score,
    support,
    evidence,
    ...(gentle_check ? { gentle_check } : {}),
    notes,
  };

  // Guard
  for (const bullet of result.evidence.bullets) {
    assertNoForbiddenLanguage(bullet);
  }
  if (result.gentle_check) {
    assertNoForbiddenLanguage(result.gentle_check);
  }

  return result;
}
