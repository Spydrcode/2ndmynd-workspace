import type {
  Artifact,
  BaselineProfile,
  CompanyProfile,
  DeviationSummary,
  HealthComparison,
  HealthyEnvelope,
} from "./schema";

import type { SnapshotNarrative } from "./insight_engine";
import { generateNarrative } from "./insight_engine";

export function buildArtifact(params: {
  company: CompanyProfile;
  baseline: BaselineProfile;
  deviation: DeviationSummary;
  envelope: HealthyEnvelope;
  health: HealthComparison;
  narrative?: SnapshotNarrative;
}): Artifact {
  const createdAt = new Date().toISOString();

  const narrative =
    params.narrative ??
    generateNarrative({
      company: params.company,
      baseline: params.baseline,
      envelope: params.envelope,
      deviation: params.deviation,
      health: params.health,
    });

  return {
    title: "Operational Pattern Snapshot",
    created_at: createdAt,
    cohort_id: params.baseline.cohort_id,
    sections: narrative.sections,
    charts: [
      { id: "jobValue", title: "Job value distribution" },
      { id: "decisionLag", title: "Decision lag shape" },
      { id: "concentration", title: "Revenue concentration" },
    ],
  };
}
