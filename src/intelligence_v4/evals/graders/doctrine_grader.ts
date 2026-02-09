import { STAGE_ORDER, type StageArtifactMap } from "../../pipeline/contracts";
import { runGlobalDoctrineGuards } from "../../pipeline/guards";

export type DoctrineGradeResult = {
  passed: boolean;
  failures: Array<{ stage: string; message: string }>;
};

export function gradeDoctrine(artifacts: Partial<StageArtifactMap>): DoctrineGradeResult {
  const failures: Array<{ stage: string; message: string }> = [];

  for (const stage of STAGE_ORDER) {
    const payload = artifacts[stage];
    if (!payload) {
      failures.push({ stage, message: "missing_stage_artifact" });
      continue;
    }

    const result = runGlobalDoctrineGuards(stage, payload);
    if (!result.passed) {
      for (const failure of result.failures) {
        failures.push({ stage, message: failure.message });
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}