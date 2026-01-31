import fs from "node:fs/promises";
import path from "node:path";

import { BaselineProfileSchema } from "./schema";
import type { BaselineProfile } from "./schema";

const BASELINES_DIR = path.join(process.cwd(), "fixtures", "baselines");

export async function loadBaseline(cohortId: string): Promise<BaselineProfile> {
  const filePath = path.join(BASELINES_DIR, `${cohortId}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = BaselineProfileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid baseline file for cohort_id=${cohortId}`);
  }
  return result.data;
}

export async function listBaselines(): Promise<Array<{ cohort_id: string; version: string }>> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(BASELINES_DIR);
  } catch {
    return [];
  }

  const results: Array<{ cohort_id: string; version: string }> = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(BASELINES_DIR, entry), "utf8");
      const candidate = BaselineProfileSchema.safeParse(JSON.parse(raw) as unknown);
      if (candidate.success) {
        results.push({ cohort_id: candidate.data.cohort_id, version: candidate.data.version });
      }
    } catch {
      // ignore invalid baseline files
    }
  }

  results.sort((a, b) => a.cohort_id.localeCompare(b.cohort_id));
  return results;
}

