import type { BaselineProfile, CompanyProfile, DeviationSummary } from "./schema";
import { DECISION_LAG_BUCKETS, MONEY_BUCKETS } from "./schema";
import { CONCENTRATION_HIGH_DELTA, CONCENTRATION_MEDIUM_DELTA } from "./calibration";

function biggestByAbsDelta(candidates: Array<{ key: string; delta: number }>) {
  let best: { key: string; delta: number } | null = null;
  for (const item of candidates) {
    if (!best || Math.abs(item.delta) > Math.abs(best.delta)) best = item;
  }
  return best;
}

export function compareToBaseline(
  company: CompanyProfile,
  baseline: BaselineProfile,
  thresholds?: {
    job_value?: number;
    decision_lag?: number;
    flow?: number;
    concentration?: {
      medium?: { top_10_percent_jobs_share: number; top_25_percent_jobs_share: number };
      high?: { top_10_percent_jobs_share: number; top_25_percent_jobs_share: number };
    };
  }
): DeviationSummary {
  const over: string[] = [];
  const under: string[] = [];
  const deltas: Array<{ key: string; delta: number }> = [];
  const jobValueThreshold = thresholds?.job_value ?? 0.12;
  const decisionLagThreshold = thresholds?.decision_lag ?? 0.12;
  const flowThreshold = thresholds?.flow ?? 0.12;
  const concentrationMedium = thresholds?.concentration?.medium ?? CONCENTRATION_MEDIUM_DELTA;
  const concentrationHigh = thresholds?.concentration?.high ?? CONCENTRATION_HIGH_DELTA;

  for (const bucket of MONEY_BUCKETS) {
    const delta = company.job_value_distribution[bucket] - baseline.job_value_distribution[bucket];
    deltas.push({ key: `job_value.${bucket}`, delta });
    if (delta >= jobValueThreshold) over.push(`job_value.${bucket}`);
    if (delta <= -jobValueThreshold) under.push(`job_value.${bucket}`);
  }

  for (const bucket of DECISION_LAG_BUCKETS) {
    const delta =
      company.decision_lag_distribution[bucket] - baseline.decision_lag_distribution[bucket];
    deltas.push({ key: `decision_lag.${bucket}`, delta });
    if (delta >= decisionLagThreshold) over.push(`decision_lag.${bucket}`);
    if (delta <= -decisionLagThreshold) under.push(`decision_lag.${bucket}`);
  }

  for (const key of ["approved", "stalled", "dropped"] as const) {
    const delta = company.quote_to_invoice_flow[key] - baseline.quote_to_invoice_flow[key];
    deltas.push({ key: `flow.${key}`, delta });
    if (delta >= flowThreshold) over.push(`flow.${key}`);
    if (delta <= -flowThreshold) under.push(`flow.${key}`);
  }

  const cTop10 = company.revenue_concentration.top_10_percent_jobs_share;
  const cTop25 = company.revenue_concentration.top_25_percent_jobs_share;
  const bTop10 = baseline.revenue_concentration.top_10_percent_jobs_share;
  const bTop25 = baseline.revenue_concentration.top_25_percent_jobs_share;

  let concentrationRisk: "low" | "medium" | "high" = "low";
  if (
    cTop10 >= bTop10 + concentrationHigh.top_10_percent_jobs_share ||
    cTop25 >= bTop25 + concentrationHigh.top_25_percent_jobs_share
  ) {
    concentrationRisk = "high";
  } else if (
    cTop10 >= bTop10 + concentrationMedium.top_10_percent_jobs_share ||
    cTop25 >= bTop25 + concentrationMedium.top_25_percent_jobs_share
  ) {
    concentrationRisk = "medium";
  }

  const notes: string[] = [];
  notes.push(
    "This snapshot is an outside perspective on the operational shape in your exports, compared to a typical baseline."
  );

  if (over.length === 0 && under.length === 0 && concentrationRisk === "low") {
    notes.push(
      "Nothing stands out as a meaningful pattern shift against the baseline; the shape looks broadly typical."
    );
  } else {
    if (over.some((k) => k.startsWith("decision_lag."))) {
      notes.push(
        "Decisions appear to take longer than the baseline in a meaningful way, which can quietly add pressure through follow-up and rescheduling."
      );
    }
    if (over.some((k) => k === "job_value.micro" || k === "job_value.small")) {
      notes.push(
        "A higher share of smaller jobs can create more context switching and make it harder to protect clean blocks of time."
      );
    }
    if (concentrationRisk === "high") {
      notes.push(
        "Revenue looks more concentrated in a small set of jobs than the baseline, which can make the week feel fragile when one project moves."
      );
    } else if (concentrationRisk === "medium") {
      notes.push(
        "Revenue shows some extra concentration, which can amplify pressure when a few jobs are delayed or negotiated."
      );
    }
  }

  const biggest = biggestByAbsDelta(deltas);
  if (biggest?.key === "decision_lag.over_30_days" || biggest?.key === "decision_lag.15_30_days") {
    notes.push(
      "If this feels heavy, it may be because decisions are stretching beyond the point where the team can hold the work in mind without friction."
    );
  } else if (biggest?.key === "job_value.micro" || biggest?.key === "job_value.small") {
    notes.push(
      "If this feels heavy, it may be because small-job churn keeps pulling attention away from deeper, steadier work."
    );
  } else if (concentrationRisk !== "low") {
    notes.push(
      "If this feels heavy, it may be because so much rides on a few jobs that small timing changes carry outsized weight."
    );
  } else {
    notes.push(
      "If this feels heavy, it may be due to a few small shape differences compounding at once, even if none are extreme alone."
    );
  }

  const recommendedDecision = (() => {
    if (
      over.includes("decision_lag.over_30_days") ||
      over.includes("decision_lag.15_30_days") ||
      over.includes("decision_lag.8_14_days")
    ) {
      return "Protect time for follow-up on medium/large quotes so decisions don’t stall.";
    }
    if (over.includes("job_value.micro") || over.includes("job_value.small")) {
      return "Set a minimum job threshold or bundle work to reduce small-job churn.";
    }
    if (concentrationRisk === "high") {
      return "Stabilize by building a repeatable path to mid-sized jobs, not more one-offs.";
    }
    return "Pick one pattern to relieve first, then re-run a fresh snapshot when you have updated exports.";
  })();

  return {
    cohort_id: baseline.cohort_id,
    run_id: company.run_id,
    computed_at: new Date().toISOString(),
    significant_overindex: over,
    significant_underindex: under,
    concentration_risk: concentrationRisk,
    deviation_notes: notes.slice(0, 6),
    recommended_decision: recommendedDecision,
  };
}
