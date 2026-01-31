import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

export const CalibrationDefaultsSchema = z.object({
  version: z.string().min(1),
  generated_at: z.string().datetime(),
  recommended_delta_thresholds: z.object({
    job_value: z.number().finite().min(0.05).max(0.5),
    decision_lag: z.number().finite().min(0.05).max(0.5),
    flow: z.number().finite().min(0.05).max(0.5),
  }),
  recommended_concentration_max: z.object({
    top_10_percent_jobs_share: z.number().finite().min(0).max(1),
    top_25_percent_jobs_share: z.number().finite().min(0).max(1),
  }),
  notes: z.array(z.string()).optional(),
});

export type CalibrationDefaults = z.infer<typeof CalibrationDefaultsSchema>;

export const FALLBACK_CALIBRATION_DEFAULTS: CalibrationDefaults = {
  version: "0.1",
  generated_at: "2026-01-01T00:00:00.000Z",
  recommended_delta_thresholds: { job_value: 0.12, decision_lag: 0.12, flow: 0.12 },
  recommended_concentration_max: { top_10_percent_jobs_share: 0.45, top_25_percent_jobs_share: 0.65 },
  notes: ["Fallback calibration defaults used (file missing or invalid)."],
};

let cached: CalibrationDefaults | null = null;

export async function loadCalibrationDefaults(calibrationId = "defaults_v1"): Promise<CalibrationDefaults> {
  if (cached && calibrationId === "defaults_v1") return cached;
  const calibrationPath = path.join(process.cwd(), "fixtures", "calibration", `${calibrationId}.json`);
  try {
    const raw = await fs.readFile(calibrationPath, "utf8");
    const parsed = CalibrationDefaultsSchema.safeParse(JSON.parse(raw) as unknown);
    if (parsed.success) {
      if (calibrationId === "defaults_v1") cached = parsed.data;
      return parsed.data;
    }
  } catch {
    // ignore
  }
  if (calibrationId === "defaults_v1") cached = FALLBACK_CALIBRATION_DEFAULTS;
  return FALLBACK_CALIBRATION_DEFAULTS;
}
