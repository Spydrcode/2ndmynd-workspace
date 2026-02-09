import type { DecisionArtifactV1 } from "../../pipeline/contracts";

export type DecisionGradeResult = {
  passed: boolean;
  errors: string[];
};

export function gradeDecisionArtifact(artifact: DecisionArtifactV1 | undefined): DecisionGradeResult {
  const errors: string[] = [];

  if (!artifact) {
    return { passed: false, errors: ["missing_final_artifact"] };
  }

  const pathKeys = Object.keys(artifact.paths ?? {}).sort();
  if (pathKeys.join(",") !== "A,B,C") {
    errors.push("paths must be exactly A,B,C");
  }

  if (!["A", "B", "C"].includes(artifact.recommended_path)) {
    errors.push("recommended_path must be A, B, or C");
  }

  if (artifact.first_30_days.length < 5 || artifact.first_30_days.length > 9) {
    errors.push("first_30_days must contain 5-9 actions");
  }

  if (!artifact.language_checks.passed || artifact.language_checks.forbidden_terms_found.length > 0) {
    errors.push("language_checks failed");
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}