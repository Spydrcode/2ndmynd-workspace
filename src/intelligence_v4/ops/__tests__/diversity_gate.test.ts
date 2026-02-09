import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateTrainingDiversityFromDataset, type TrainingDiversityPolicy } from "../diversity_gate";

const policy: TrainingDiversityPolicy = {
  min_total_rows: 10,
  min_industries: 4,
  max_industry_share: 0.6,
  max_duplicate_actions_share: 0.8,
  max_same_primary_constraint_prefix_share: 0.8,
};

function writeDataset(filePath: string, rows: unknown[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

describe("training diversity gate", () => {
  it("fails when one industry dominates", () => {
    const filePath = path.join(os.tmpdir(), `dataset-${Date.now()}-dominated.jsonl`);
    const rows = Array.from({ length: 10 }, (_, index) => ({
      approved: true,
      industry: index < 9 ? "plumbing" : "agency",
      output: {
        primary_constraint: "Owner approval queue is overloaded",
        first_30_days: ["Set a single weekly planning block", "Use a short daily triage window"],
      },
    }));

    writeDataset(filePath, rows);
    const result = evaluateTrainingDiversityFromDataset(filePath, policy);

    expect(result.passed).toBe(false);
    expect(result.failures.join(" ").toLowerCase()).toContain("top industry share");
  });

  it("passes when industry mix is balanced", () => {
    const filePath = path.join(os.tmpdir(), `dataset-${Date.now()}-balanced.jsonl`);
    const industries = ["agency", "saas_micro", "professional_services", "ecommerce_ops", "logistics_dispatch"];
    const rows = Array.from({ length: 20 }, (_, index) => {
      const industry = industries[index % industries.length];
      return {
        approved: true,
        industry,
        output: {
          primary_constraint: `${industry} owner context switching under pressure`,
          first_30_days: [
            `Define ${industry} intake boundaries`,
            `Set ${industry} weekly decision window`,
            `Assign ${industry} escalation owner`,
          ],
        },
      };
    });

    writeDataset(filePath, rows);
    const result = evaluateTrainingDiversityFromDataset(filePath, policy);

    expect(result.passed).toBe(true);
    expect(result.summary.unique_industries).toBeGreaterThanOrEqual(4);
  });
});
