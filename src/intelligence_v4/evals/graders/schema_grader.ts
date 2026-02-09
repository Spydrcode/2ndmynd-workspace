import { STAGE_ORDER, type StageArtifactMap } from "../../pipeline/contracts";
import { validateStageArtifact } from "../../pipeline/contracts";

export type SchemaGradeResult = {
  passed: boolean;
  by_stage: Record<string, { ok: boolean; errors: string[] }>;
};

export function gradeSchema(artifacts: Partial<StageArtifactMap>): SchemaGradeResult {
  const by_stage: Record<string, { ok: boolean; errors: string[] }> = {};

  for (const stage of STAGE_ORDER) {
    const payload = artifacts[stage];
    if (!payload) {
      by_stage[stage] = { ok: false, errors: ["missing_stage_artifact"] };
      continue;
    }
    by_stage[stage] = validateStageArtifact(stage, payload);
  }

  const passed = Object.values(by_stage).every((result) => result.ok);
  return { passed, by_stage };
}