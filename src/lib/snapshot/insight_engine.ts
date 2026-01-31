import type {
  BaselineProfile,
  CompanyProfile,
  DeviationSummary,
  HealthComparison,
  HealthyEnvelope,
} from "./schema";

import { chooseRecommendedDecision } from "./healthy";

function uniqSentences(sentences: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function humanizeKey(key: string) {
  if (key.startsWith("job_value.")) return `job mix: ${key.replace("job_value.", "").replace(/_/g, " ")}`;
  if (key.startsWith("decision_lag.")) return `decision timing: ${key.replace("decision_lag.", "").replace(/_/g, " ")}`;
  if (key.startsWith("concentration.")) return `concentration: ${key.replace("concentration.", "").replace(/_/g, " ")}`;
  if (key.startsWith("flow.")) return `flow: ${key.replace("flow.", "").replace(/_/g, " ")}`;
  return key.replace(/_/g, " ");
}

export type SnapshotNarrative = {
  insights: string[];
  recommended_decision: string;
  sections: Array<{ heading: string; body: string }>;
};

export function generateNarrative(params: {
  company: CompanyProfile;
  baseline: BaselineProfile;
  envelope: HealthyEnvelope;
  deviation: DeviationSummary;
  health: HealthComparison;
}): SnapshotNarrative {
  const recommendedDecision = chooseRecommendedDecision({
    company: params.company,
    baseline: params.baseline,
    deviation: params.deviation,
    health: params.health,
  });

  const stableOutside = params.health.outside_keys;
  const stableLine =
    stableOutside.length > 0
      ? `Compared to a low-pressure operating range, this business is outside the stable zone in: ${stableOutside
          .slice(0, 4)
          .map(humanizeKey)
          .join(", ")}.`
      : "Compared to a low-pressure operating range, the shape stays inside the stable zone.";

  const keyDeltas = uniqSentences([
    ...params.deviation.deviation_notes,
    ...params.health.health_notes,
  ]).slice(0, 6);

  const section1 =
    "Businesses in this cohort usually show a balanced mix of job sizes, with decisions landing in a predictable window after a quote is sent. " +
    "Revenue tends to come from a spread of jobs rather than being concentrated in only a few.";

  const section2Parts: string[] = [];
  if (params.deviation.significant_overindex.length > 0 || params.deviation.significant_underindex.length > 0) {
    section2Parts.push(
      "This business meaningfully differs from the typical shape in a few areas, which changes how the week feels to run."
    );
  } else {
    section2Parts.push("The overall shape is close to the typical baseline. Where it differs is subtle rather than dramatic.");
  }
  section2Parts.push(stableLine);
  const section2 = section2Parts.join(" ");

  const section3Parts: string[] = [];
  if (params.health.results.decision_lag !== "within_range") {
    section3Parts.push(
      "When decisions stretch, work sits in limbo longer than it should, which adds pressure through follow-up and re-planning."
    );
  }
  if (params.health.results.job_mix !== "within_range") {
    section3Parts.push(
      "When the mix tilts toward smaller jobs, context switching rises and it gets harder to protect clean blocks of time."
    );
  }
  if (params.health.results.concentration !== "within_range") {
    section3Parts.push(
      "When revenue is carried by a small set of jobs, normal timing changes can feel heavier than they should."
    );
  }
  if (section3Parts.length === 0) {
    section3Parts.push(
      "Even when the shape is stable, pressure can come from small frictions stacking up across quoting, scheduling, and delivery."
    );
  }
  section3Parts.push("This snapshot is an outside perspective—use it to find the pressure point that’s worth changing first.");
  const section3 = section3Parts.join(" ");

  const section4 =
    `${recommendedDecision} ` +
    "Treat it as a single, decision-first experiment—not a new reporting habit.";

  return {
    insights: keyDeltas.slice(0, 6),
    recommended_decision: recommendedDecision,
    sections: [
      { heading: "What’s typical for businesses like this", body: section1 },
      { heading: "Where this business meaningfully differs", body: section2 },
      { heading: "Why it likely feels heavy", body: section3 },
      { heading: "One clear next step", body: section4 },
    ],
  };
}

