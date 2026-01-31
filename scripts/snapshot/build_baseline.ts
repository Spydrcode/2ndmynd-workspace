import fs from "node:fs/promises";
import path from "node:path";

import minimist from "minimist";

import {
  BaselineProfileSchema,
  CompanyProfileSchema,
  DECISION_LAG_BUCKETS,
  MONEY_BUCKETS,
} from "../../src/lib/snapshot/schema";

type Args = {
  input_dir?: string;
  cohort_id?: string;
  version?: string;
};

async function findCompanyProfiles(rootDir: string) {
  const results: string[] = [];

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile() && entry.name === "companyProfile.json") {
        results.push(full);
      }
    }
  }

  await walk(rootDir);
  return results;
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function normalizeDistribution<T extends string>(keys: readonly T[], values: Record<T, number>) {
  const total = keys.reduce((sum, k) => sum + (values[k] ?? 0), 0);
  if (total <= 0) return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  return Object.fromEntries(keys.map((k) => [k, (values[k] ?? 0) / total])) as Record<T, number>;
}

async function main() {
  const argv = minimist<Args>(process.argv.slice(2));
  const inputDir = argv.input_dir ? path.resolve(argv.input_dir) : null;
  const cohortId = argv.cohort_id?.trim();
  const version = argv.version?.trim();

  if (!inputDir || !cohortId || !version) {
    throw new Error("Usage: tsx scripts/snapshot/build_baseline.ts --input_dir <dir> --cohort_id <id> --version <v>");
  }

  const files = await findCompanyProfiles(inputDir);
  if (files.length === 0) {
    throw new Error(`No companyProfile.json files found under ${inputDir}`);
  }

  const companies = [];
  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = CompanyProfileSchema.safeParse(JSON.parse(raw) as unknown);
      if (parsed.success) companies.push(parsed.data);
    } catch {
      // ignore invalid
    }
  }

  if (companies.length === 0) {
    throw new Error("No valid company profiles found (schema validation failed).");
  }

  const n = companies.length;

  const avgJob = Object.fromEntries(MONEY_BUCKETS.map((k) => [k, 0])) as Record<(typeof MONEY_BUCKETS)[number], number>;
  for (const company of companies) {
    for (const bucket of MONEY_BUCKETS) {
      avgJob[bucket] += company.job_value_distribution[bucket] / n;
    }
  }

  const avgDecision = Object.fromEntries(DECISION_LAG_BUCKETS.map((k) => [k, 0])) as Record<(typeof DECISION_LAG_BUCKETS)[number], number>;
  for (const company of companies) {
    for (const bucket of DECISION_LAG_BUCKETS) {
      avgDecision[bucket] += company.decision_lag_distribution[bucket] / n;
    }
  }

  const avgFlow = { approved: 0, stalled: 0, dropped: 0 };
  for (const company of companies) {
    avgFlow.approved += company.quote_to_invoice_flow.approved / n;
    avgFlow.stalled += company.quote_to_invoice_flow.stalled / n;
    avgFlow.dropped += company.quote_to_invoice_flow.dropped / n;
  }

  const baseline = {
    cohort_id: cohortId,
    version,
    sample_size: n,
    created_at: new Date().toISOString(),
    job_value_distribution: normalizeDistribution(MONEY_BUCKETS, avgJob),
    decision_lag_distribution: normalizeDistribution(DECISION_LAG_BUCKETS, avgDecision),
    revenue_concentration: {
      top_10_percent_jobs_share: median(companies.map((c) => c.revenue_concentration.top_10_percent_jobs_share)),
      top_25_percent_jobs_share: median(companies.map((c) => c.revenue_concentration.top_25_percent_jobs_share)),
    },
    quote_to_invoice_flow: avgFlow,
  };

  const validated = BaselineProfileSchema.safeParse(baseline);
  if (!validated.success) {
    throw new Error("Generated baseline failed schema validation.");
  }

  const outPath = path.join(process.cwd(), "fixtures", "baselines", `${cohortId}.json`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(validated.data, null, 2), "utf8");

  process.stdout.write(`Wrote baseline: ${outPath}\n`);
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : "build_baseline failed\n");
  process.exit(1);
});
