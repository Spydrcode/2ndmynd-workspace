/**
 * Value-Confidence Inference — 3-Signal Method
 *
 * For each ValuePropTag, compute confidence from 3 evidence sources:
 * 1. Declared intent evidence: selected in Q1 OR implied by priorities/non-negotiables/anti-goals
 * 2. Behavioral evidence: derived from RealitySignals (CSV data)
 * 3. Refusal evidence: derived from non_negotiables + anti_goals
 *
 * DOCTRINE:
 * - When signals are missing, mark evidence as "unknown", not false.
 * - Conflicts between selections reduce confidence — but never override the owner's stated intent.
 * - No external comparisons. All thresholds are relative to the owner's own data.
 */

import type {
  OwnerIntentIntake,
  ValuePropTag,
  ValuePropConfidence,
  IntentConfidence,
  IntentConflict,
  VALUE_PROP_TAGS,
} from "../types/intent_intake";
import type { RealitySignals, RealitySignal } from "../types/coherence_engine";

// ============================================================================
// BEHAVIORAL EVIDENCE MAPPING TABLE
// ============================================================================

/**
 * Maps each ValuePropTag to the RealitySignals that would provide behavioral evidence.
 *
 * Each entry specifies:
 * - signal_ids: which signal IDs to look for
 * - check: a function that evaluates whether the signals support the tag
 * - threshold_note: human-readable explanation of the threshold
 *
 * When a signal is missing, the check returns "unknown" — NOT false.
 */

type BehavioralCheck = {
  signal_ids: string[];
  check: (signals: RealitySignal[]) => boolean | "unknown";
  threshold_note: string;
};

export const BEHAVIORAL_EVIDENCE_MAP: Record<ValuePropTag, BehavioralCheck> = {
  speed_responsiveness: {
    signal_ids: ["sig_timing_decision_lag", "sig_volume_quotes", "sig_volume_approval_rate"],
    check: (sigs) => {
      const lagSig = sigs.find(s => s.id === "sig_timing_decision_lag");
      const approvalSig = sigs.find(s => s.id === "sig_volume_approval_rate");
      // If no timing data exists, we can't assess speed
      if (!lagSig && !approvalSig) return "unknown";
      // Low decision lag + decent approval = speed is supported
      if (!lagSig) return "unknown"; // lag is the key signal for speed
      // If decision lag is NOT high, owner is being responsive
      return lagSig.magnitude < 55;
    },
    threshold_note: "Low decision lag + high approval rate suggest fast, responsive service.",
  },

  affordability: {
    signal_ids: ["sig_volume_invoices", "sig_volume_quotes", "sig_volume_approval_rate"],
    check: (sigs) => {
      const invoiceSig = sigs.find(s => s.id === "sig_volume_invoices");
      const approvalSig = sigs.find(s => s.id === "sig_volume_approval_rate");
      if (!invoiceSig) return "unknown";
      // High volume + high approval rate implies accessible pricing
      const highVolume = invoiceSig.magnitude >= 30;
      const goodApproval = !approvalSig || approvalSig.magnitude < 50; // low magnitude on approval = good
      return highVolume && goodApproval;
    },
    threshold_note: "High job count + decent approval rate = prices are accessible. Thin margins proxy if available.",
  },

  clarity_communication: {
    signal_ids: ["sig_timing_decision_lag", "sig_volume_approval_rate"],
    check: (sigs) => {
      const lagSig = sigs.find(s => s.id === "sig_timing_decision_lag");
      const approvalSig = sigs.find(s => s.id === "sig_volume_approval_rate");
      if (!lagSig && !approvalSig) return "unknown";
      // Fast decisions + good approval = clear communication
      const lowLag = !lagSig || lagSig.magnitude < 55;
      const goodApproval = !approvalSig || approvalSig.magnitude < 50;
      return lowLag && goodApproval;
    },
    threshold_note: "Lower decision lag + fewer cancellations + faster quote approval suggests clear communication.",
  },

  safety_compliance: {
    signal_ids: ["sig_capacity_demand_exceeds_capacity"],
    check: (sigs) => {
      const capSig = sigs.find(s => s.id.includes("capacity"));
      if (!capSig) return "unknown";
      // If capacity is NOT strained, safety standards are maintainable
      return capSig.magnitude < 60;
    },
    threshold_note: "Manageable capacity suggests room for safety protocols. Compliance notes/flags checked if available.",
  },

  premium_quality: {
    signal_ids: ["sig_volume_invoices", "sig_volume_quotes"],
    check: (sigs) => {
      const invoiceSig = sigs.find(s => s.id === "sig_volume_invoices");
      if (!invoiceSig) return "unknown";
      // Lower volume (but present) could be premium — not proof, but consistent
      // Premium businesses tend to have moderate volume with higher ticket sizes
      // We can only approximate: lower volume doesn't contradict premium
      return invoiceSig.magnitude <= 60;
    },
    threshold_note: "Higher ticket sizes + longer job durations + lower callbacks. Volume data is a rough proxy.",
  },

  availability_when_others_wont: {
    signal_ids: ["sig_rhythm_volatility", "sig_volume_quotes"],
    check: (sigs) => {
      const volSig = sigs.find(s => s.id === "sig_rhythm_volatility");
      if (!volSig) return "unknown";
      // High volatility could indicate emergency/after-hours work
      return volSig.magnitude >= 50;
    },
    threshold_note: "After-hours/weekend load, emergency tags, high demand variance suggest availability-based value.",
  },

  local_trust: {
    signal_ids: ["sig_concentration_customer"],
    check: (sigs) => {
      const concSig = sigs.find(s => s.id.includes("concentration"));
      if (!concSig) return "unknown";
      // High customer concentration can indicate trust/repeat relationships
      return concSig.magnitude >= 40;
    },
    threshold_note: "High repeat rate, referrals, dense geo clustering (if available) suggest local trust.",
  },

  convenience_low_hassle: {
    signal_ids: ["sig_volume_approval_rate", "sig_timing_decision_lag"],
    check: (sigs) => {
      const approvalSig = sigs.find(s => s.id === "sig_volume_approval_rate");
      const lagSig = sigs.find(s => s.id === "sig_timing_decision_lag");
      if (!approvalSig && !lagSig) return "unknown";
      // Good approval + low lag = easy to buy from
      const goodApproval = !approvalSig || approvalSig.magnitude < 50;
      const lowLag = !lagSig || lagSig.magnitude < 55;
      return goodApproval && lowLag;
    },
    threshold_note: "Fewer visits per job, bundled services, higher close rate suggest convenience-oriented business.",
  },

  relationship_care: {
    signal_ids: ["sig_concentration_customer"],
    check: (sigs) => {
      const concSig = sigs.find(s => s.id.includes("concentration"));
      if (!concSig) return "unknown";
      // Customer concentration correlates with deep relationships
      return concSig.magnitude >= 35;
    },
    threshold_note: "Repeat customers, long-term relationships visible in concentration data.",
  },

  other_custom: {
    signal_ids: [],
    check: () => "unknown",
    threshold_note: "Custom value prop — no automatic behavioral evidence mapping available.",
  },
};

// ============================================================================
// DECLARED INTENT EVIDENCE (Q1 selection + implied by Q2–Q4)
// ============================================================================

/**
 * Maps priorities, non-negotiables, and anti-goals to implied ValuePropTags.
 * If a priority implies a value prop, it counts as declared evidence.
 */
const PRIORITY_IMPLIES_VALUE: Partial<Record<string, ValuePropTag[]>> = {
  profit_margin: ["affordability", "premium_quality"],
  predictability_stability: ["local_trust", "relationship_care"],
  safety_compliance: ["safety_compliance"],
  customer_experience: ["clarity_communication", "relationship_care", "convenience_low_hassle"],
  speed_throughput: ["speed_responsiveness"],
  craftsmanship_quality: ["premium_quality"],
  low_stress_owner: ["convenience_low_hassle"],
  time_freedom: ["convenience_low_hassle"],
  reputation_trust: ["local_trust", "relationship_care", "premium_quality"],
  growth_scale: ["availability_when_others_wont", "affordability"],
};

const NON_NEGOTIABLE_IMPLIES_VALUE: Partial<Record<string, ValuePropTag[]>> = {
  no_safety_compromise: ["safety_compliance"],
  no_quality_compromise: ["premium_quality", "craftsmanship_quality" as unknown as ValuePropTag],
  keep_prices_fair: ["affordability"],
  protect_reputation: ["local_trust", "relationship_care"],
  no_pushy_sales: ["relationship_care", "clarity_communication"],
  follow_regulations_strictly: ["safety_compliance"],
};

const ANTI_GOAL_IMPLIES_REFUSAL: Partial<Record<string, ValuePropTag[]>> = {
  dont_raise_prices_aggressively: ["affordability"],
  dont_upsell_unneeded: ["relationship_care", "clarity_communication"],
  dont_chase_growth_at_all_costs: ["local_trust", "relationship_care"],
  dont_accept_high_risk_jobs: ["safety_compliance"],
  dont_work_nights_weekends: [],
  dont_scale_headcount: [],
  dont_take_debt: [],
  dont_expand_service_area: ["local_trust"],
};

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

type ConflictRule = {
  id: string;
  test: (intake: OwnerIntentIntake) => boolean;
  description: string;
  tags_involved: string[];
};

const CONFLICT_RULES: ConflictRule[] = [
  {
    id: "conflict_affordability_premium",
    test: (intake) => {
      const hasBothVP = intake.value_prop_tags.includes("affordability") && intake.value_prop_tags.includes("premium_quality");
      const affordInVP = intake.value_prop_tags.includes("affordability");
      const premiumInPriority = intake.priorities_ranked.includes("craftsmanship_quality");
      return hasBothVP || (affordInVP && premiumInPriority);
    },
    description: "Positioning as both affordable and premium creates tension — customers may struggle to understand where you fit.",
    tags_involved: ["affordability", "premium_quality", "craftsmanship_quality"],
  },
  {
    id: "conflict_speed_no_nights",
    test: (intake) => {
      const speedPriority = intake.priorities_ranked.includes("speed_throughput");
      const noNights = intake.anti_goals.includes("dont_work_nights_weekends");
      const staySmall = intake.non_negotiables.includes("stay_small_owner_led");
      return speedPriority && noNights && staySmall;
    },
    description: "Maximizing throughput while staying small and avoiding nights/weekends requires very tight scheduling — this may create stress.",
    tags_involved: ["speed_throughput", "dont_work_nights_weekends", "stay_small_owner_led"],
  },
  {
    id: "conflict_profit_fair_prices",
    test: (intake) => {
      const profitTop = intake.priorities_ranked[0] === "profit_margin";
      const keepFair = intake.non_negotiables.includes("keep_prices_fair");
      const dontRaise = intake.anti_goals.includes("dont_raise_prices_aggressively");
      return profitTop && (keepFair || dontRaise);
    },
    description: "Profit margin as the top priority alongside fair-pricing commitments limits your pricing levers — margins will need to come from efficiency, not rates.",
    tags_involved: ["profit_margin", "keep_prices_fair", "dont_raise_prices_aggressively"],
  },
  {
    id: "conflict_growth_stay_small",
    test: (intake) => {
      const growth = intake.priorities_ranked.includes("growth_scale");
      const staySmall = intake.non_negotiables.includes("stay_small_owner_led");
      const dontScale = intake.anti_goals.includes("dont_scale_headcount");
      return growth && (staySmall || dontScale);
    },
    description: "Growth and staying small are in tension — scaling typically requires more hands or systems.",
    tags_involved: ["growth_scale", "stay_small_owner_led", "dont_scale_headcount"],
  },
  {
    id: "conflict_low_stress_owner_bottleneck",
    test: (intake) => {
      const lowStress = intake.priorities_ranked.includes("low_stress_owner");
      const bottleneck = intake.primary_constraint === "owner_bottleneck_decisions";
      return lowStress && bottleneck;
    },
    description: "You want less stress, but you're also the bottleneck. Reducing stress will require trusting others or building systems.",
    tags_involved: ["low_stress_owner", "owner_bottleneck_decisions"],
  },
];

export function detectIntakeConflicts(intake: OwnerIntentIntake): IntentConflict[] {
  return CONFLICT_RULES
    .filter(rule => rule.test(intake))
    .map(rule => ({
      id: rule.id,
      tags_involved: rule.tags_involved,
      description: rule.description,
    }));
}

// ============================================================================
// VALUE EVIDENCE INFERENCE
// ============================================================================

export type EvidenceStrength = "strong" | "weak" | "unknown";

export type ValueEvidenceResult = {
  per_tag: Array<{
    tag: ValuePropTag;
    declared: boolean;
    behavioral: boolean | "unknown";
    refusal: boolean;
    /** IDs of signals that contributed to behavioral evidence. */
    signal_ids: string[];
    /** Strength of the evidence: strong (2+ sources agree), weak (1 source), unknown (no data). */
    strength: EvidenceStrength;
  }>;
  conflicts: IntentConflict[];
};

/**
 * Infer evidence for each ValuePropTag from the intake + reality signals.
 *
 * 3-signal method:
 * - Declared: directly selected in Q1 OR implied by Q2/Q3/Q4
 * - Behavioral: CSV-derived signals say the business acts this way
 * - Refusal: Q3 (non-negotiables) or Q4 (anti-goals) reinforce this value
 */
export function inferValueEvidence(
  intake: OwnerIntentIntake,
  signals: RealitySignals
): ValueEvidenceResult {
  const selectedTags = new Set(intake.value_prop_tags);
  const conflicts = detectIntakeConflicts(intake);

  const per_tag = (intake.value_prop_tags.length > 0
    ? intake.value_prop_tags
    : (Object.keys(BEHAVIORAL_EVIDENCE_MAP) as ValuePropTag[])
  ).map(tag => inferSingleTag(tag, intake, signals, selectedTags));

  // If intake had tags, also check implied tags that weren't explicitly selected
  if (intake.value_prop_tags.length > 0) {
    const impliedTags = getImpliedTags(intake);
    for (const tag of impliedTags) {
      if (!per_tag.some(p => p.tag === tag)) {
        per_tag.push(inferSingleTag(tag, intake, signals, selectedTags));
      }
    }
  }

  return { per_tag, conflicts };
}

function inferSingleTag(
  tag: ValuePropTag,
  intake: OwnerIntentIntake,
  signals: RealitySignals,
  selectedTags: Set<ValuePropTag>
): ValueEvidenceResult["per_tag"][0] {
  // 1. Declared evidence
  const directlySelected = selectedTags.has(tag);
  const impliedByPriority = intake.priorities_ranked.some(
    p => PRIORITY_IMPLIES_VALUE[p]?.includes(tag)
  );
  const impliedByNN = intake.non_negotiables.some(
    n => NON_NEGOTIABLE_IMPLIES_VALUE[n]?.includes(tag)
  );
  const declared = directlySelected || impliedByPriority || impliedByNN;

  // 2. Behavioral evidence
  const mapping = BEHAVIORAL_EVIDENCE_MAP[tag];
  const matchingSignals = signals.signals.filter(
    s => mapping.signal_ids.some(id => s.id === id || s.id.includes(id.replace("sig_", "")))
  );
  const signal_ids = matchingSignals.map(s => s.id);
  const behavioral = matchingSignals.length > 0
    ? mapping.check(matchingSignals)
    : "unknown";

  // 3. Refusal evidence (non-negotiables or anti-goals that reinforce this value)
  const refusalFromNN = intake.non_negotiables.some(
    n => NON_NEGOTIABLE_IMPLIES_VALUE[n]?.includes(tag)
  );
  const refusalFromAG = intake.anti_goals.some(
    a => ANTI_GOAL_IMPLIES_REFUSAL[a]?.includes(tag)
  );
  const refusal = refusalFromNN || refusalFromAG;

  // 4. Compute strength
  let sourceCount = 0;
  if (declared) sourceCount++;
  if (behavioral === true) sourceCount++;
  if (refusal) sourceCount++;

  let strength: EvidenceStrength;
  if (behavioral === "unknown" && !declared && !refusal) {
    strength = "unknown";
  } else if (sourceCount >= 2) {
    strength = "strong";
  } else {
    strength = "weak";
  }

  return { tag, declared, behavioral, refusal, signal_ids, strength };
}

function getImpliedTags(intake: OwnerIntentIntake): ValuePropTag[] {
  const implied = new Set<ValuePropTag>();
  for (const p of intake.priorities_ranked) {
    for (const vp of PRIORITY_IMPLIES_VALUE[p] ?? []) {
      implied.add(vp);
    }
  }
  for (const nn of intake.non_negotiables) {
    for (const vp of NON_NEGOTIABLE_IMPLIES_VALUE[nn] ?? []) {
      implied.add(vp);
    }
  }
  return [...implied];
}

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

/**
 * Compute per-tag confidence using the 3-signal method:
 *
 * Score 0-3 (each source contributes 0 or 1):
 * - declared = 1
 * - behavioral = 1 (if true, 0 if false, skip if "unknown")
 * - refusal = 1
 *
 * Confidence:
 * - high: score >= 3 OR (score == 2 AND includes behavioral evidence)
 * - med: score == 2 without behavioral, OR behavioral alone is strong
 * - low: otherwise
 *
 * Conflicts reduce confidence by one level.
 */
export function computeValueConfidence(
  evidence: ValueEvidenceResult
): ValuePropConfidence[] {
  const conflictTags = new Set(
    evidence.conflicts.flatMap(c => c.tags_involved)
  );

  return evidence.per_tag.map(({ tag, declared, behavioral, refusal }) => {
    let score = 0;
    if (declared) score++;
    if (behavioral === true) score++;
    if (refusal) score++;

    let confidence: IntentConfidence;
    if (score >= 3) {
      confidence = "high";
    } else if (score === 2 && behavioral === true) {
      confidence = "high";
    } else if (score === 2) {
      confidence = "med";
    } else if (behavioral === true) {
      // behavioral alone is strong
      confidence = "med";
    } else {
      confidence = "low";
    }

    // Conflicts reduce confidence by one level
    if (conflictTags.has(tag)) {
      if (confidence === "high") confidence = "med";
      else if (confidence === "med") confidence = "low";
    }

    const notes: string[] = [];
    if (behavioral === "unknown") {
      notes.push("No behavioral data available — evidence is based on stated intent only.");
    }
    if (behavioral === false) {
      notes.push("Behavioral data does not clearly support this value — consider whether it matches your experience.");
    }
    if (conflictTags.has(tag)) {
      notes.push("This tag is involved in a detected conflict, which reduces our confidence.");
    }

    return {
      tag,
      score,
      confidence,
      sources: { declared, behavioral, refusal },
      notes: notes.length > 0 ? notes : undefined,
    };
  });
}
