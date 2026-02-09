export type IntelligenceV4ErrorCode =
  | "STAGE_INPUT_INVALID"
  | "MODEL_OUTPUT_NOT_JSON"
  | "SCHEMA_VALIDATION_FAILED"
  | "DOCTRINE_GUARD_FAILED"
  | "STAGE_EXECUTION_FAILED"
  | "PIPELINE_ABORTED";

export type StageFailureArtifact = {
  stage_failed: string;
  reason: string;
  validation_errors: string[];
  guard_failures: string[];
  next_action: string;
};

export class PipelineStageError extends Error {
  readonly code: IntelligenceV4ErrorCode;
  readonly stage_name: string;
  readonly validation_errors: string[];
  readonly guard_failures: string[];
  readonly next_action: string;

  constructor(params: {
    code: IntelligenceV4ErrorCode;
    stage_name: string;
    reason: string;
    validation_errors?: string[];
    guard_failures?: string[];
    next_action?: string;
  }) {
    super(params.reason);
    this.name = "PipelineStageError";
    this.code = params.code;
    this.stage_name = params.stage_name;
    this.validation_errors = params.validation_errors ?? [];
    this.guard_failures = params.guard_failures ?? [];
    this.next_action =
      params.next_action ??
      "Inspect stage payload and guard output, then rerun with corrected stage input.";
  }

  toFailureArtifact(): StageFailureArtifact {
    return {
      stage_failed: this.stage_name,
      reason: this.message,
      validation_errors: this.validation_errors,
      guard_failures: this.guard_failures,
      next_action: this.next_action,
    };
  }
}

export function toStageFailureArtifact(error: unknown, stageName: string): StageFailureArtifact {
  if (error instanceof PipelineStageError) {
    return error.toFailureArtifact();
  }

  const reason = error instanceof Error ? error.message : String(error);
  return {
    stage_failed: stageName,
    reason,
    validation_errors: [],
    guard_failures: [],
    next_action: "Review logs for the failing stage and rerun the pipeline.",
  };
}