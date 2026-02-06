/**
 * generateDecisionPaths — Create path_A, path_B, and "neither" from tensions + intent.
 *
 * DOCTRINE:
 * - Path A protects the owner's top priorities.
 * - Path B relaxes a priority for operational stability.
 * - "Neither" = clean exit / do nothing (valid).
 * - Each path has a 2–4 step 7-day plan.
 * - No pricing advice unless the owner's intent explicitly includes profit/margin goals.
 * - Language is calm, operational, non-judgmental.
 */

import type {
  OwnerIntentModel,
  RealitySignals,
  CoherenceTension,
  DecisionPathCoherence,
  SevenDayStep,
} from "../types/coherence_engine";

// ============================================================================
// VALUE LABEL MAPPINGS (tension_id → related value-prop tags)
// ============================================================================

const TENSION_VALUE_MAP: Record<string, string[]> = {
  tension_concentration: ["local_trust", "relationship_care", "affordability"],
  tension_cash_timing: ["affordability", "premium_quality"],
  tension_capacity_strain: ["speed_responsiveness", "safety_compliance", "premium_quality"],
  tension_volume_rhythm: ["speed_responsiveness", "convenience_low_hassle"],
  tension_decision_lag: ["speed_responsiveness", "clarity_communication"],
  tension_low_approval: ["affordability", "clarity_communication"],
  tension_owner_dependency: ["convenience_low_hassle", "speed_responsiveness"],
  tension_communication_overload: ["clarity_communication", "relationship_care"],
};

/**
 * Get value-prop labels protected by a tension's resolution.
 */
function getValueLabelsForTension(
  tension: CoherenceTension,
  intent: OwnerIntentModel
): string[] {
  const tags = TENSION_VALUE_MAP[tension.id] ?? [];
  const vc = intent.value_confidence ?? [];
  const labelMap = new Map(vc.map((v) => [v.tag, valuePropLabel(v.tag)]));

  // Also check value_proposition tags
  const vpTags = intent.value_proposition.tags;
  for (const tag of vpTags) {
    if (!labelMap.has(tag)) {
      labelMap.set(tag, valuePropLabel(tag));
    }
  }

  return tags
    .filter((tag) => labelMap.has(tag))
    .map((tag) => labelMap.get(tag)!)
    .filter((label, i, arr) => arr.indexOf(label) === i); // dedupe
}

/** Human-friendly label for value-prop tags. */
function valuePropLabel(tag: string): string {
  const labels: Record<string, string> = {
    speed_responsiveness: "Fast response",
    affordability: "Fair pricing",
    clarity_communication: "Clear communication",
    safety_compliance: "Safety compliance",
    premium_quality: "Premium quality",
    availability_when_others_wont: "After-hours availability",
    local_trust: "Local reputation",
    convenience_low_hassle: "Low hassle",
    relationship_care: "Customer relationships",
    other_custom: "Custom value",
  };
  return labels[tag] ?? tag;
}

export function generateDecisionPaths(
  intent: OwnerIntentModel,
  signals: RealitySignals,
  tensions: CoherenceTension[]
): DecisionPathCoherence[] {
  if (tensions.length === 0) {
    return [buildNeitherPath("No significant tensions were detected. The business appears to be operating in line with your stated intent.")];
  }

  const topTension = tensions[0];
  const secondTension = tensions.length > 1 ? tensions[1] : null;
  const hasPricingIntent = intentIncludesPricing(intent);

  const pathA = buildPathA(intent, topTension, secondTension, hasPricingIntent);
  const pathB = buildPathB(intent, topTension, secondTension, hasPricingIntent);
  const neither = buildNeitherPath(
    `You could choose to take no action and continue as-is. The current tensions will persist but are not urgent enough to force a decision.`
  );

  return [pathA, pathB, neither];
}

// ── Path A: protect the owner's top priorities ──
function buildPathA(
  intent: OwnerIntentModel,
  primary: CoherenceTension,
  secondary: CoherenceTension | null,
  hasPricingIntent: boolean
): DecisionPathCoherence {
  const protects = extractProtected(intent, primary);
  const tradesOff = extractTradeoffs(primary, secondary);
  const steps = buildSevenDaySteps(primary, "protect", hasPricingIntent);

  // Value anchors: Path A protects primary tension's related values
  const protectsValues = getValueLabelsForTension(primary, intent);
  // Relaxes: secondary tension's values (if any) may receive less attention
  const relaxesValues = secondary ? getValueLabelsForTension(secondary, intent) : [];

  return {
    name: "path_A",
    thesis: `Address the core tension by protecting what matters most to you: ${protects[0] ?? "your top priority"}.`,
    protects,
    trades_off: tradesOff,
    protects_values: protectsValues.length > 0 ? protectsValues : undefined,
    relaxes_values: relaxesValues.length > 0 ? relaxesValues : undefined,
    operational_shift: buildOperationalShifts(primary, "protect"),
    risks: buildRisks(primary, "protect"),
    seven_day_plan: { steps },
    thirty_day_followup: {
      title: `Reassess whether ${primary.intent_anchor.toLowerCase()} still feels protected`,
      why: `After 30 days, the structural changes should be visible in your day-to-day experience. Check if the tension has eased.`,
    },
    boundary_warning: buildBoundaryWarning(intent, primary),
  };
}

// ── Path B: relax a priority for stability ──
function buildPathB(
  intent: OwnerIntentModel,
  primary: CoherenceTension,
  secondary: CoherenceTension | null,
  hasPricingIntent: boolean
): DecisionPathCoherence {
  const relaxed = primary.intent_anchor;
  const protects = secondary
    ? extractProtected(intent, secondary)
    : ["operational stability"];
  const tradesOff = [
    `Accept that ${relaxed.toLowerCase()} may not be fully protected in the short term.`,
  ];
  const steps = buildSevenDaySteps(primary, "relax", hasPricingIntent);

  // Value anchors: Path B relaxes primary tension's values
  const relaxesValues = getValueLabelsForTension(primary, intent);
  // Protects: secondary tension's values (if any) get more focus
  const protectsValues = secondary ? getValueLabelsForTension(secondary, intent) : [];

  return {
    name: "path_B",
    thesis: `Accept the current tension around ${primary.intent_anchor.toLowerCase()} and focus resources on ${secondary?.intent_anchor.toLowerCase() ?? "maintaining stability"}.`,
    protects,
    trades_off: tradesOff,
    protects_values: protectsValues.length > 0 ? protectsValues : undefined,
    relaxes_values: relaxesValues.length > 0 ? relaxesValues : undefined,
    operational_shift: buildOperationalShifts(primary, "relax"),
    risks: buildRisks(primary, "relax"),
    seven_day_plan: { steps },
    thirty_day_followup: {
      title: `Check whether relaxing ${relaxed.toLowerCase()} caused downstream effects`,
      why: `Some costs of accepting a tension don't appear immediately. At 30 days, look for changes in stress, cash, or customer sentiment.`,
    },
    boundary_warning: `If ${relaxed.toLowerCase()} worsens beyond what you can tolerate, revisit Path A.`,
  };
}

// ── Neither path ──
function buildNeitherPath(reason: string): DecisionPathCoherence {
  return {
    name: "neither",
    thesis: reason,
    protects: ["current routine"],
    trades_off: ["The identified tensions remain unaddressed."],
    operational_shift: ["No changes to current operations."],
    risks: ["If tensions worsen over time, future corrections may require more effort."],
    seven_day_plan: {
      steps: [
        {
          title: "Observe",
          why: "Confirm that the current state is genuinely sustainable.",
          how: "Note any moments this week where the tensions feel relevant.",
          effort: "low",
        },
      ],
    },
    thirty_day_followup: {
      title: "Revisit whether the current state is still acceptable",
      why: "Sometimes doing nothing is the right call. But it should be a conscious choice, not inertia.",
    },
    boundary_warning: "If a major client leaves, a key employee departs, or cash reserves drop below your comfort level, reconsider.",
  };
}

// ── Helpers ──

function intentIncludesPricing(intent: OwnerIntentModel): boolean {
  const allText = [
    intent.value_proposition.statement,
    ...intent.priorities_ranked,
    intent.definition_of_success,
    ...intent.anti_goals,
  ].join(" ");
  return /profit|margin|pric|revenue|earn|income/i.test(allText);
}

function extractProtected(intent: OwnerIntentModel, tension: CoherenceTension): string[] {
  const out: string[] = [];
  // Add the intent anchor's core value
  const anchor = tension.intent_anchor.replace(/^You (value|insist on|set a boundary:)\s*/i, "").replace(/"/g, "");
  out.push(anchor);
  // Add non-negotiables that are related
  for (const nn of intent.non_negotiables) {
    if (!out.includes(nn)) out.push(nn);
    if (out.length >= 3) break;
  }
  return out;
}

function extractTradeoffs(
  primary: CoherenceTension,
  secondary: CoherenceTension | null
): string[] {
  const out: string[] = [];
  out.push(`Addressing this tension requires time and attention that could go elsewhere.`);
  if (secondary) {
    out.push(`The tension around "${secondary.intent_anchor.toLowerCase()}" will not be addressed in this path.`);
  }
  return out;
}

function buildOperationalShifts(tension: CoherenceTension, mode: "protect" | "relax"): string[] {
  const shifts: string[] = [];
  const id = tension.id;

  if (mode === "protect") {
    if (id === "tension_concentration") {
      shifts.push("Begin outreach to 2–3 new potential relationships this month.");
      shifts.push("Review which existing relationships are most aligned with your value proposition.");
    } else if (id === "tension_cash_timing") {
      shifts.push("Introduce or enforce payment terms on new quotes.");
      shifts.push("Set up a weekly 15-minute invoice follow-up routine.");
    } else if (id === "tension_owner_dependency") {
      shifts.push("Identify 1–2 decisions that can be delegated or systematized this month.");
      shifts.push("Document your approval criteria so someone else can apply them.");
    } else if (id === "tension_capacity_strain") {
      shifts.push("Audit current jobs to identify any that fall outside your value proposition.");
      shifts.push("Consider whether selective referrals could reduce workload without losing reputation.");
    } else if (id === "tension_volume_rhythm") {
      shifts.push("Look at your last 3 months for patterns in when work arrives.");
      shifts.push("Explore whether any clients would accept scheduled start dates.");
    } else if (id === "tension_decision_lag") {
      shifts.push("Add a follow-up step to your quoting process (e.g., 5-day check-in).");
      shifts.push("Consider setting quote expiration dates to flush stale prospects.");
    } else if (id === "tension_low_approval") {
      shifts.push("Review the last 10 declined quotes for common patterns.");
      shifts.push("Identify which prospect types convert well and focus quoting effort there.");
    } else {
      shifts.push("Review the tension evidence and identify one small structural change.");
    }
  } else {
    shifts.push("Acknowledge this tension but take no immediate action to resolve it.");
    shifts.push("Observe for 30 days to see if it stabilizes on its own.");
  }

  return shifts;
}

function buildRisks(tension: CoherenceTension, mode: "protect" | "relax"): string[] {
  if (mode === "protect") {
    return [
      "Change requires effort and may cause short-term disruption.",
      "New processes take time to become habitual.",
    ];
  }
  return [
    "The tension may worsen gradually if left unaddressed.",
    tension.owner_cost,
  ];
}

function buildSevenDaySteps(
  tension: CoherenceTension,
  mode: "protect" | "relax",
  hasPricingIntent: boolean
): SevenDayStep[] {
  const steps: SevenDayStep[] = [];
  const id = tension.id;

  if (mode === "protect") {
    steps.push({
      title: "Review the evidence",
      why: "Ground any action in what the data actually shows.",
      how: `Check the signals supporting "${tension.claim.split(",")[0]}." Do they match your experience?`,
      effort: "low",
    });

    if (id === "tension_concentration") {
      steps.push({
        title: "List your top 5 relationships by volume",
        why: "Understand where concentration exists before acting.",
        how: "Check your invoices or CRM for the largest sources of work.",
        effort: "low",
      });
      steps.push({
        title: "Reach out to one new prospect",
        why: "Start diversifying without pressure.",
        how: "Contact someone in your network who might need your services. No hard sell.",
        effort: "med",
      });
    } else if (id === "tension_cash_timing") {
      steps.push({
        title: "Review outstanding invoices",
        why: "Know exactly what's owed and when.",
        how: "List all invoices over 30 days old. Note the total.",
        effort: "low",
      });
      if (hasPricingIntent) {
        steps.push({
          title: "Consider deposit or milestone terms",
          why: "Front-loading cash improves predictability.",
          how: "Draft new payment terms (e.g., 50% deposit) for next week's quotes.",
          effort: "med",
        });
      }
    } else if (id === "tension_owner_dependency") {
      steps.push({
        title: "Track your interruptions for 2 days",
        why: "See where your time actually goes.",
        how: "Keep a simple tally of decisions only you can make.",
        effort: "low",
      });
      steps.push({
        title: "Pick one decision to delegate",
        why: "Start small to build trust in the process.",
        how: "Choose the lowest-risk approval and write down your criteria for it.",
        effort: "med",
      });
    } else if (id === "tension_capacity_strain") {
      steps.push({
        title: "Map current commitments",
        why: "See total load before deciding what to change.",
        how: "List all active jobs and their expected completion dates.",
        effort: "med",
      });
    } else if (id === "tension_volume_rhythm") {
      steps.push({
        title: "Chart your last 12 weeks of inbound work",
        why: "Visual patterns are easier to see.",
        how: "Use your quote/invoice dates to build a simple week-by-week count.",
        effort: "med",
      });
    } else if (id === "tension_decision_lag") {
      steps.push({
        title: "List quotes older than 14 days without a decision",
        why: "Identify the backlog.",
        how: "Check your quoting tool for stale quotes.",
        effort: "low",
      });
      steps.push({
        title: "Send a brief follow-up to the oldest 3",
        why: "Clear the backlog without being pushy.",
        how: "A simple 'Still interested?' message. No pressure.",
        effort: "low",
      });
    } else if (id === "tension_low_approval") {
      steps.push({
        title: "Review the last 10 unapproved quotes",
        why: "Look for patterns in what gets declined.",
        how: "Note job type, size, and client type for each.",
        effort: "med",
      });
    } else {
      steps.push({
        title: "Identify one small action",
        why: "Momentum matters more than perfection.",
        how: "Choose the smallest change that could ease this tension.",
        effort: "low",
      });
    }
  } else {
    // relax mode
    steps.push({
      title: "Acknowledge the tension",
      why: "Deciding to accept something is still a decision — and a valid one.",
      how: `Read through the claim: "${tension.claim}" and confirm you're comfortable with the current state.`,
      effort: "low",
    });
    steps.push({
      title: "Set a 30-day reminder",
      why: "Acceptance should be reviewed, not forgotten.",
      how: "Add a calendar note to check on this tension in 30 days.",
      effort: "low",
    });
  }

  return steps.slice(0, 4);
}

function buildBoundaryWarning(intent: OwnerIntentModel, tension: CoherenceTension): string {
  // If the owner has relevant boundaries, reference them
  const boundaries = Object.values(intent.boundaries).filter(Boolean) as string[];
  if (boundaries.length > 0) {
    return `If this tension starts to conflict with your boundary ("${boundaries[0]}"), reconsider this path.`;
  }
  return `If ${tension.intent_anchor.toLowerCase()} deteriorates to the point where it affects your definition of success, reconsider.`;
}
