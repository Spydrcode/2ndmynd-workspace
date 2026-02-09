import fs from "node:fs";

export type TrainingDiversityPolicy = {
  min_total_rows: number;
  min_industries: number;
  max_industry_share: number;
  max_duplicate_actions_share: number;
  max_same_primary_constraint_prefix_share: number;
};

export type TrainingDiversitySummary = {
  total_rows: number;
  approved_rows: number;
  industries: Array<{ industry: string; count: number; share: number }>;
  top_industry_share: number;
  unique_industries: number;
  duplicate_actions_share: number;
  same_constraint_prefix_share: number;
};

export type TrainingDiversityResult = {
  passed: boolean;
  failures: string[];
  summary: TrainingDiversitySummary;
};

type DatasetRowLite = {
  approved?: boolean;
  industry?: string;
  output?: {
    first_30_days?: string[];
    primary_constraint?: string;
  };
};

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toConstraintPrefix(value: string | undefined): string {
  const normalized = normalizeToken(value ?? "");
  if (!normalized) return "unknown";
  const tokens = normalized.split(" ").filter((token) => token.length > 0);
  return tokens.slice(0, 5).join(" ") || "unknown";
}

function readRows(datasetPath: string): DatasetRowLite[] {
  if (!fs.existsSync(datasetPath)) return [];
  const lines = fs
    .readFileSync(datasetPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rows: DatasetRowLite[] = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line) as DatasetRowLite);
    } catch {
      // Skip malformed lines.
    }
  }
  return rows;
}

export function evaluateTrainingDiversity(rows: DatasetRowLite[], policy: TrainingDiversityPolicy): TrainingDiversityResult {
  const approvedRows = rows.filter((row) => row.approved === true);
  const industryCounts = new Map<string, number>();
  const actionCounts = new Map<string, number>();
  const constraintPrefixCounts = new Map<string, number>();

  let totalActions = 0;

  for (const row of approvedRows) {
    const industry = typeof row.industry === "string" && row.industry.trim().length > 0 ? row.industry.trim() : "unknown";
    industryCounts.set(industry, (industryCounts.get(industry) ?? 0) + 1);

    const actions = Array.isArray(row.output?.first_30_days) ? row.output?.first_30_days ?? [] : [];
    for (const action of actions) {
      const normalized = normalizeToken(String(action));
      if (!normalized) continue;
      actionCounts.set(normalized, (actionCounts.get(normalized) ?? 0) + 1);
      totalActions += 1;
    }

    const prefix = toConstraintPrefix(row.output?.primary_constraint);
    constraintPrefixCounts.set(prefix, (constraintPrefixCounts.get(prefix) ?? 0) + 1);
  }

  const approvedCount = approvedRows.length;
  const industries = [...industryCounts.entries()]
    .map(([industry, count]) => ({
      industry,
      count,
      share: approvedCount > 0 ? count / approvedCount : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const topIndustryShare = industries[0]?.share ?? 0;
  const uniqueIndustries = industries.length;
  const topActionCount = actionCounts.size > 0 ? Math.max(...actionCounts.values()) : 0;
  const duplicateActionsShare = totalActions > 0 ? topActionCount / totalActions : 0;
  const topConstraintPrefixCount = constraintPrefixCounts.size > 0 ? Math.max(...constraintPrefixCounts.values()) : 0;
  const sameConstraintPrefixShare = approvedCount > 0 ? topConstraintPrefixCount / approvedCount : 0;

  const failures: string[] = [];

  if (approvedCount < policy.min_total_rows) {
    failures.push(`Approved rows ${approvedCount} below minimum ${policy.min_total_rows}.`);
  }

  if (uniqueIndustries < policy.min_industries) {
    failures.push(`Only ${uniqueIndustries} industries represented; minimum is ${policy.min_industries}.`);
  }

  if (topIndustryShare > policy.max_industry_share) {
    failures.push(
      `Top industry share ${(topIndustryShare * 100).toFixed(1)}% exceeds max ${(policy.max_industry_share * 100).toFixed(1)}%.`
    );
  }

  if (duplicateActionsShare > policy.max_duplicate_actions_share) {
    failures.push(
      `Duplicate action share ${(duplicateActionsShare * 100).toFixed(1)}% exceeds max ${(policy.max_duplicate_actions_share * 100).toFixed(1)}%.`
    );
  }

  if (sameConstraintPrefixShare > policy.max_same_primary_constraint_prefix_share) {
    failures.push(
      `Primary constraint prefix share ${(sameConstraintPrefixShare * 100).toFixed(1)}% exceeds max ${(policy.max_same_primary_constraint_prefix_share * 100).toFixed(1)}%.`
    );
  }

  return {
    passed: failures.length === 0,
    failures,
    summary: {
      total_rows: rows.length,
      approved_rows: approvedCount,
      industries,
      top_industry_share: topIndustryShare,
      unique_industries: uniqueIndustries,
      duplicate_actions_share: duplicateActionsShare,
      same_constraint_prefix_share: sameConstraintPrefixShare,
    },
  };
}

export function evaluateTrainingDiversityFromDataset(
  datasetPath: string,
  policy: TrainingDiversityPolicy
): TrainingDiversityResult {
  const rows = readRows(datasetPath);
  return evaluateTrainingDiversity(rows, policy);
}
