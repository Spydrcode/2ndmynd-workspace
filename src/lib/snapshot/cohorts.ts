export type CohortConfig = {
  cohort_id: string;
  label: string; // internal / admin only
  baseline_id: string;
  envelope_id: string;
  calibration_id?: string;
};

export const COHORTS: Record<string, CohortConfig> = {
  local_service_general: {
    cohort_id: "local_service_general",
    label: "Local service — general",
    baseline_id: "local_service_general_v1",
    envelope_id: "local_service_stable_v1",
    calibration_id: "defaults_v1",
  },
  local_service_project_heavy: {
    cohort_id: "local_service_project_heavy",
    label: "Local service — project-heavy (placeholder)",
    baseline_id: "local_service_general_v1",
    envelope_id: "local_service_stable_v1",
    calibration_id: "defaults_v1",
  },
  local_service_high_volume: {
    cohort_id: "local_service_high_volume",
    label: "Local service — high-volume (placeholder)",
    baseline_id: "local_service_general_v1",
    envelope_id: "local_service_stable_v1",
    calibration_id: "defaults_v1",
  },
};

