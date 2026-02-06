/**
 * generateCoherenceTensions — Map intent ↔ reality conflicts into named tensions.
 *
 * DOCTRINE:
 * - 3–6 tensions max. Each must cite at least one signal_id.
 * - Severity weighted by the priority rank of the intent_anchor.
 * - Language is calm, structural. No moralizing. No external comparisons.
 * - Include what_must_be_true gates so the owner can self-evaluate.
 */

import type {
  OwnerIntentModel,
  RealitySignals,
  RealitySignal,
  CoherenceTension,
  ValuePropAlignment,
} from "../types/coherence_engine";

// ── Priority weight: top priority gets 1.0, each subsequent drops ──
function priorityWeight(rank: number, total: number): number {
  if (total <= 1) return 1.0;
  return 1.0 - (rank / (total + 1)) * 0.5;
}

// ── Tension template: matching signal categories to potential intent conflicts ──
type TensionRule = {
  id: string;
  categories: RealitySignal["category"][];
  /** These tags from the owner's intent make this tension relevant. */
  intentMatchers: RegExp[];
  buildClaim: (signals: RealitySignal[], intent: OwnerIntentModel) => string;
  buildMechanism: (signals: RealitySignal[]) => string;
  buildCost: (signals: RealitySignal[], intent: OwnerIntentModel) => string;
  buildWMBT: () => string[];
};

const TENSION_RULES: TensionRule[] = [
  {
    id: "tension_concentration",
    categories: ["concentration"],
    intentMatchers: [/stab/i, /predictab/i, /depend/i, /safe/i, /secur/i, /risk/i, /reliab/i],
    buildClaim: (sigs, intent) => {
      const pct = sigs[0]?.data_points?.concentration_pct;
      return `You value stability, but a small number of sources account for ~${pct}% of activity, which means losing one could force sudden changes.`;
    },
    buildMechanism: () =>
      "When a large share of revenue depends on a few relationships, any single departure causes a disproportionate impact on cash flow and schedule.",
    buildCost: () =>
      "Stress from dependency, potential need to rapidly replace lost volume, reduced negotiating position.",
    buildWMBT: () => [
      "You would need to develop 2–3 new relationships within 90 days to meaningfully reduce concentration.",
      "Those new relationships would need to be reliable enough to accept without heavy discounting.",
    ],
  },
  {
    id: "tension_cash_timing",
    categories: ["cash", "timing"],
    intentMatchers: [/cash/i, /pay/i, /stress/i, /financ/i, /stab/i, /predict/i, /risk/i],
    buildClaim: (sigs) => {
      const lagSig = sigs.find((s) => s.id.includes("payment_lag"));
      const pct = lagSig?.data_points?.high_payment_lag_pct ?? "many";
      return `You want financial predictability, but ${pct}% of invoices take longer to collect, which means cash arrives unevenly.`;
    },
    buildMechanism: () =>
      "Slow-paying invoices create gaps between when work is completed and when payment is received, compressing the owner's options for covering expenses.",
    buildCost: () =>
      "Time spent chasing payments, anxiety about meeting obligations, and potential need for credit or reserves.",
    buildWMBT: () => [
      "Clients would need to accept stricter payment terms without leaving.",
      "You would need a process (or tool) to follow up on overdue invoices without it feeling adversarial.",
    ],
  },
  {
    id: "tension_owner_dependency",
    categories: ["owner_dependency"],
    intentMatchers: [/time/i, /stress/i, /weekend/i, /work.life/i, /delegat/i, /free/i, /burnout/i, /fire.?fight/i, /sustain/i],
    buildClaim: (sigs, intent) => {
      const depTypes = sigs.map((s) => s.data_points?.dependency_type).filter(Boolean).join(", ");
      return `You want to protect your time and energy, but the business currently depends on you for ${depTypes || "critical decisions"}, which limits your flexibility.`;
    },
    buildMechanism: () =>
      "When the owner is the bottleneck for approvals, quoting, or customer relationships, stepping away creates delays or errors.",
    buildCost: () =>
      "Personal time, stress, inability to take time off without business impact.",
    buildWMBT: () => [
      "Someone else (employee or system) would need to handle routine approvals without quality dropping.",
      "You would need to tolerate imperfect decisions by others during a training period.",
    ],
  },
  {
    id: "tension_capacity_strain",
    categories: ["capacity"],
    intentMatchers: [/quality/i, /reput/i, /never.leave/i, /reliab/i, /custom/i, /safe/i, /compli/i, /license/i],
    buildClaim: (sigs) => {
      const evidence = sigs.map((s) => s.observation).join(" ");
      return `You prioritize quality and reliability, but current capacity signals suggest the workload is pushing limits, which risks the standards you care about.`;
    },
    buildMechanism: () =>
      "When demand strains available capacity, corners get cut — not intentionally, but structurally. Scheduling tightens, follow-up slips, and the owner compensates by working more.",
    buildCost: () =>
      "Reputation risk from inconsistent delivery, owner overwork, and stress.",
    buildWMBT: () => [
      "You would need to either reduce incoming volume or increase capacity (hire, subcontract, or restructure).",
      "Reduced volume would need to exclude lower-value work, not your best relationships.",
    ],
  },
  {
    id: "tension_volume_rhythm",
    categories: ["rhythm", "volume"],
    intentMatchers: [/predict/i, /stab/i, /plan/i, /grow/i, /scale/i, /consisten/i],
    buildClaim: (sigs) => {
      const volSig = sigs.find((s) => s.id.includes("volatility"));
      const band = volSig?.data_points?.volatility_band ?? "significant";
      return `You want predictable operations, but week-to-week activity varies (${band} volatility), making it harder to plan resources and cash flow.`;
    },
    buildMechanism: () =>
      "High variability in inbound work means alternating between scrambling and idle periods, which is structurally exhausting.",
    buildCost: () =>
      "Difficulty planning staffing, lumpy cash flow, and mental load from constant re-prioritization.",
    buildWMBT: () => [
      "Demand would need to be smoothed through scheduling, retainers, or seasonal planning.",
      "You would need to be willing to turn away some urgent requests in peak weeks.",
    ],
  },
  {
    id: "tension_decision_lag",
    categories: ["timing"],
    intentMatchers: [/efficien/i, /fast/i, /respon/i, /customer/i, /close/i, /conver/i, /cash/i],
    buildClaim: (sigs) => {
      const lagSig = sigs.find((s) => s.id.includes("decision_lag"));
      const band = lagSig?.data_points?.decision_lag_band ?? "extended";
      return `You value responsiveness, but quotes sit for a ${band} period before decisions are made, which slows the pipeline.`;
    },
    buildMechanism: () =>
      "Slow decisions create a backlog of uncertain work, making it hard to commit capacity and predict near-term revenue.",
    buildCost: () =>
      "Wasted quoting effort, uncertain scheduling, and cash flow gaps between quoting and approval.",
    buildWMBT: () => [
      "Follow-up processes would need to be consistent and non-pushy.",
      "Some quotes may need expiration dates to flush stale prospects.",
    ],
  },
  {
    id: "tension_low_approval",
    categories: ["volume"],
    intentMatchers: [/profit/i, /margi/i, /efficien/i, /price/i, /valu/i, /grow/i, /afford/i],
    buildClaim: (sigs) => {
      const approvalSig = sigs.find((s) => s.id.includes("approval_rate"));
      return `You invest time quoting, but a lower-than-expected share of quotes are being approved, which means effort is spent on work that never materializes.`;
    },
    buildMechanism: () =>
      "A low approval rate indicates either a misalignment between offerings and prospects, or friction in the decision process — both solvable.",
    buildCost: () =>
      "Time spent quoting work that doesn't convert, opportunity cost of pursuing better-fit prospects.",
    buildWMBT: () => [
      "You would need to identify which quote types convert well and which do not.",
      "Declining to quote certain work would need to feel acceptable, not like losing business.",
    ],
  },
];

// ── Main generator ──

export function generateCoherenceTensions(
  intent: OwnerIntentModel,
  signals: RealitySignals,
  alignments: ValuePropAlignment[] = []
): CoherenceTension[] {
  const allIntentText = [
    intent.value_proposition.statement,
    ...intent.priorities_ranked,
    ...intent.non_negotiables,
    ...intent.anti_goals,
    intent.definition_of_success,
    intent.boundaries.time ?? "",
    intent.boundaries.stress ?? "",
    intent.boundaries.risk ?? "",
    intent.boundaries.reputation ?? "",
    intent.boundaries.compliance ?? "",
  ].join(" ");

  const candidateTensions: CoherenceTension[] = [];

  for (const rule of TENSION_RULES) {
    // 1. Check that we have relevant signals
    const matchingSignals = signals.signals.filter((s) =>
      rule.categories.includes(s.category)
    );
    if (matchingSignals.length === 0) continue;

    // 2. Check that the owner's intent touches this tension
    const intentMatch = rule.intentMatchers.some((rx) => rx.test(allIntentText));
    if (!intentMatch) continue;

    // 3. Compute severity = max signal magnitude × priority weight
    const maxMagnitude = Math.max(...matchingSignals.map((s) => s.magnitude));
    const lowestConfidence = matchingSignals.some((s) => s.confidence === "low")
      ? "low"
      : matchingSignals.some((s) => s.confidence === "med")
        ? "med"
        : "high";

    // Find the priority rank of the intent anchor
    const anchorPriority = findAnchorPriority(intent, rule.intentMatchers);
    const weight = priorityWeight(anchorPriority.rank, intent.priorities_ranked.length);
    const severity = Math.min(Math.round(maxMagnitude * weight), 100);

    const claim = rule.buildClaim(matchingSignals, intent);
    const mechanism = rule.buildMechanism(matchingSignals);
    const ownerCost = rule.buildCost(matchingSignals, intent);
    const wmbt = rule.buildWMBT();

    // Enrich with alignment context: find relevant alignment items
    const relevantAlignments = alignments.filter((a) =>
      rule.intentMatchers.some((rx) => rx.test(a.tag.replace(/_/g, " ")) || rx.test(a.label))
    );

    // Add alignment-sourced signal_ids to evidence
    const alignmentSignalIds = relevantAlignments.flatMap((a) => a.evidence.signal_ids);

    // Build enhanced claim with support-status-specific phrasing per spec
    let enhancedClaim = claim;
    for (const al of relevantAlignments) {
      if (al.support === "crowded_out") {
        // Spec: "You care about X, but pressure is crowding it out…"
        enhancedClaim += ` You care about ${al.label}, but pressure is crowding it out — the numbers show friction.`;
      } else if (al.support === "mixed") {
        // Spec: "X shows up, but it's inconsistent because…"
        enhancedClaim += ` ${al.label} shows up, but it's not consistently protected yet — the evidence is mixed.`;
      } else if (al.support === "unknown") {
        // Spec: "We can't see X clearly from the data provided. One pressure pattern we can see is…"
        enhancedClaim += ` We can't see ${al.label} clearly from the data provided.`;
      } else if (al.support === "supported") {
        // Spec: "You're protecting X — the cost is Y."
        enhancedClaim += ` You're protecting ${al.label} — the cost shows up elsewhere.`;
      }
    }

    // Add gentle_check to what_must_be_true for low-confidence alignments
    const enhancedWmbt = [...wmbt];
    for (const al of relevantAlignments) {
      if (al.gentle_check && al.confidence === "low") {
        enhancedWmbt.push(al.gentle_check);
      }
    }

    candidateTensions.push({
      id: rule.id,
      intent_anchor: anchorPriority.anchor,
      claim: enhancedClaim,
      evidence: {
        signal_ids: [
          ...matchingSignals.map((s) => s.id),
          ...alignmentSignalIds,
        ],
        data_points: Object.fromEntries(
          matchingSignals.flatMap((s) =>
            Object.entries(s.data_points).map(([k, v]) => [`${s.id}.${k}`, v])
          )
        ),
      },
      mechanism,
      owner_cost: ownerCost,
      severity,
      confidence: lowestConfidence as "low" | "med" | "high",
      what_must_be_true: enhancedWmbt,
    });
  }

  // Sort by severity descending, cap at 6
  candidateTensions.sort((a, b) => b.severity - a.severity);
  return candidateTensions.slice(0, 6);
}

// ── Helper: find which owner priority anchors this tension ──
function findAnchorPriority(
  intent: OwnerIntentModel,
  matchers: RegExp[]
): { anchor: string; rank: number } {
  for (let i = 0; i < intent.priorities_ranked.length; i++) {
    const p = intent.priorities_ranked[i];
    if (matchers.some((rx) => rx.test(p))) {
      return { anchor: `You value ${p.toLowerCase()}`, rank: i };
    }
  }
  // Check non-negotiables
  for (const nn of intent.non_negotiables) {
    if (matchers.some((rx) => rx.test(nn))) {
      return { anchor: `You insist on ${nn.toLowerCase()}`, rank: 0 }; // non-negotiables = top priority
    }
  }
  // Check boundaries
  const boundaryTexts = Object.values(intent.boundaries).filter(Boolean) as string[];
  for (const bt of boundaryTexts) {
    if (matchers.some((rx) => rx.test(bt))) {
      return { anchor: `You set a boundary: "${bt}"`, rank: 1 };
    }
  }
  // Fallback
  return { anchor: "This touches your stated priorities", rank: intent.priorities_ranked.length };
}
