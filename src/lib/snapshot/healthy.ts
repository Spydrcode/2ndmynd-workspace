import fs from "node:fs/promises";
import path from "node:path";

import type {
  BaselineProfile,
  CompanyProfile,
  DeviationSummary,
  HealthBand,
  HealthComparison,
  HealthyEnvelope,
} from "./schema";
import { HealthComparisonSchema, HealthyEnvelopeSchema } from "./schema";

const ENVELOPES_DIR = path.join(process.cwd(), "fixtures", "healthy_envelopes");

const BORDERLINE_MARGIN = 0.03;

function classifyRange(value: number, range: { min: number; max: number }): HealthBand {
  if (value < range.min - BORDERLINE_MARGIN || value > range.max + BORDERLINE_MARGIN) {
    return "outside_range";
  }
  if (value < range.min || value > range.max) return "borderline";
  if (Math.abs(value - range.min) <= BORDERLINE_MARGIN || Math.abs(value - range.max) <= BORDERLINE_MARGIN) {
    return "borderline";
  }
  return "within_range";
}

function classifyMax(value: number, max: number): HealthBand {
  if (value > max + BORDERLINE_MARGIN) return "outside_range";
  if (value > max) return "borderline";
  if (max - value <= BORDERLINE_MARGIN) return "borderline";
  return "within_range";
}

function overallFromBands(bands: HealthBand[]) {
  if (bands.includes("outside_range")) return "outside_range" as const;
  if (bands.includes("borderline")) return "borderline" as const;
  return "within_range" as const;
}

export async function loadHealthyEnvelope(envelopeId: string): Promise<HealthyEnvelope> {
  const filePath = path.join(ENVELOPES_DIR, `${envelopeId}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = HealthyEnvelopeSchema.safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) throw new Error(`Invalid healthy envelope for envelope_id=${envelopeId}`);
  return parsed.data;
}

export function compareToHealthyEnvelope(
  company: CompanyProfile,
  envelope: HealthyEnvelope
): HealthComparison {
  const jobBands: Array<{ key: string; band: HealthBand }> = [];
  for (const [bucket, range] of Object.entries(envelope.job_value_ranges)) {
    const value = (company.job_value_distribution as Record<string, number>)[bucket] ?? 0;
    jobBands.push({ key: `job_value.${bucket}`, band: classifyRange(value, range) });
  }

  const lagBands: Array<{ key: string; band: HealthBand }> = [];
  for (const [bucket, range] of Object.entries(envelope.decision_lag_ranges)) {
    const value = (company.decision_lag_distribution as Record<string, number>)[bucket] ?? 0;
    lagBands.push({ key: `decision_lag.${bucket}`, band: classifyRange(value, range) });
  }

  const concentrationBands: Array<{ key: string; band: HealthBand }> = [
    {
      key: "concentration.top_10_percent_jobs_share",
      band: classifyMax(
        company.revenue_concentration.top_10_percent_jobs_share,
        envelope.revenue_concentration_ranges.top_10_percent_jobs_share.max
      ),
    },
    {
      key: "concentration.top_25_percent_jobs_share",
      band: classifyMax(
        company.revenue_concentration.top_25_percent_jobs_share,
        envelope.revenue_concentration_ranges.top_25_percent_jobs_share.max
      ),
    },
  ];

  const outsideKeys = [...jobBands, ...lagBands, ...concentrationBands]
    .filter((entry) => entry.band === "outside_range")
    .map((entry) => entry.key);

  const results = {
    job_mix: overallFromBands(jobBands.map((b) => b.band)),
    decision_lag: overallFromBands(lagBands.map((b) => b.band)),
    concentration: overallFromBands(concentrationBands.map((b) => b.band)),
  };

  const draft: HealthComparison = {
    envelope_id: envelope.envelope_id,
    run_id: company.run_id,
    computed_at: new Date().toISOString(),
    results,
    outside_keys: outsideKeys,
    health_notes: [],
  };

  const withNotes: HealthComparison = { ...draft, health_notes: generateHealthNotes(draft) };
  const validated = HealthComparisonSchema.safeParse(withNotes);
  return validated.success ? validated.data : withNotes;
}

export function generateHealthNotes(health: HealthComparison) {
  const notes: string[] = [];
  notes.push("This check compares the snapshot to a low-pressure operating range, not an ideal target.");

  const outside = health.outside_keys;
  if (outside.length === 0) {
    notes.push("The shape sits inside the stable range across job mix, decision timing, and concentration.");
    notes.push("That usually means pressure is coming from execution details, not from the overall mix.");
    return notes.slice(0, 5);
  }

  if (health.results.decision_lag === "outside_range") {
    notes.push(
      "Decision timing is outside the stable range, which can quietly add pressure through follow-up loops and re-planning."
    );
  } else if (health.results.decision_lag === "borderline") {
    notes.push("Decision timing is close to the edge of the stable range, so small delays can compound quickly.");
  }

  if (health.results.job_mix === "outside_range") {
    notes.push("Job mix is outside the stable range, which often shows up as context switching and scattered attention.");
  } else if (health.results.job_mix === "borderline") {
    notes.push("Job mix is near the stable boundary, so protecting clean blocks of time becomes more important.");
  }

  if (health.results.concentration === "outside_range") {
    notes.push("Revenue concentration is outside the stable range, so a few jobs can carry outsized pressure when they move.");
  } else if (health.results.concentration === "borderline") {
    notes.push("Revenue concentration is near the stable boundary, which can amplify pressure when a couple jobs slip.");
  }

  return notes.slice(0, 5);
}

export function chooseRecommendedDecision(params: {
  company: CompanyProfile;
  baseline: BaselineProfile;
  deviation: DeviationSummary;
  health: HealthComparison;
}) {
  const outside = new Set(params.health.outside_keys);
  if (
    outside.has("decision_lag.over_30_days") ||
    outside.has("decision_lag.15_30_days") ||
    params.health.results.decision_lag === "outside_range"
  ) {
    return "Protect time for follow-up on medium/large quotes so decisions don’t stall.";
  }

  if (outside.has("job_value.micro") || outside.has("job_value.small") || params.health.results.job_mix === "outside_range") {
    return "Set a minimum job threshold or bundle work to reduce small-job churn.";
  }

  if (outside.has("concentration.top_10_percent_jobs_share") || outside.has("concentration.top_25_percent_jobs_share") || params.health.results.concentration === "outside_range") {
    return "Stabilize by building a repeatable path to mid-sized jobs, not more one-offs.";
  }

  return params.deviation.recommended_decision;
}

