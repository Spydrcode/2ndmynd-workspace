import crypto from "node:crypto";

export type ManifestStepStatus = "pending" | "running" | "succeeded" | "skipped" | "failed";

export type ManifestStep = {
  step_name: string;
  status: ManifestStepStatus;
  started_at?: string;
  finished_at?: string;
  input_fingerprint?: string;
  output_refs?: string[];
  notes?: string;
  error_message?: string;
};

export type RunManifest = {
  run_id: string;
  workspace_id: string;
  mode: string;
  lock_id?: string;
  created_at: string;
  finalized_at?: string;
  steps: ManifestStep[];
};

const DECISION_V2_STEPS = [
  "parse_normalize_pack",
  "build_business_profile",
  "build_snapshot_v2",
  "predictive_context",
  "infer_decision_v2",
  "validate_conclusion_v2",
] as const;

export function createManifest(run_id: string, workspace_id: string, mode: string, lock_id?: string): RunManifest {
  return {
    run_id,
    workspace_id,
    mode,
    lock_id,
    created_at: new Date().toISOString(),
    steps: DECISION_V2_STEPS.map((step_name) => ({
      step_name,
      status: "pending",
    })),
  };
}

export function markStepStart(
  manifest: RunManifest,
  step_name: string,
  input_fingerprint?: string
): RunManifest {
  return {
    ...manifest,
    steps: manifest.steps.map((step) =>
      step.step_name === step_name
        ? {
            ...step,
            status: "running" as ManifestStepStatus,
            started_at: new Date().toISOString(),
            input_fingerprint,
          }
        : step
    ),
  };
}

export function markStepSuccess(
  manifest: RunManifest,
  step_name: string,
  output_refs?: string[],
  notes?: string
): RunManifest {
  return {
    ...manifest,
    steps: manifest.steps.map((step) =>
      step.step_name === step_name
        ? {
            ...step,
            status: "succeeded" as ManifestStepStatus,
            finished_at: new Date().toISOString(),
            output_refs,
            notes,
          }
        : step
    ),
  };
}

export function markStepSkipped(manifest: RunManifest, step_name: string, reason?: string): RunManifest {
  return {
    ...manifest,
    steps: manifest.steps.map((step) =>
      step.step_name === step_name
        ? {
            ...step,
            status: "skipped" as ManifestStepStatus,
            finished_at: new Date().toISOString(),
            notes: reason,
          }
        : step
    ),
  };
}

export function markStepError(manifest: RunManifest, step_name: string, error_message: string): RunManifest {
  return {
    ...manifest,
    steps: manifest.steps.map((step) =>
      step.step_name === step_name
        ? {
            ...step,
            status: "failed" as ManifestStepStatus,
            finished_at: new Date().toISOString(),
            error_message,
          }
        : step
    ),
  };
}

export function finalizeManifest(manifest: RunManifest): RunManifest {
  return {
    ...manifest,
    finalized_at: new Date().toISOString(),
  };
}

/**
 * Create a stable fingerprint from aggregate metadata (not raw data)
 */
export function createInputFingerprint(data: {
  file_names?: string[];
  row_counts?: Record<string, number>;
  date_range?: { start: string; end: string };
}): string {
  const normalized = JSON.stringify({
    files: data.file_names?.sort() ?? [],
    counts: data.row_counts ?? {},
    range: data.date_range ?? null,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}
