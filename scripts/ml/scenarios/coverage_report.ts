import fs from "node:fs";
import path from "node:path";

import { PATTERNS } from "./pattern_library";
import { DISTINCTIVE_KEYS } from "./signal_schema";

type Args = {
  inputPath: string;
};

const DEFAULTS: Args = {
  inputPath: "./ml_scenarios/packs.json",
};

type SnapshotV1 = {
  signals: Record<string, string>;
};

type ScenarioPack = {
  split: "train" | "eval";
  expected: { pattern_id: string; conclusion_v1: { evidence_signals?: string[] } };
  input_snapshot: SnapshotV1;
  meta?: {
    mixed?: boolean;
    counterexample?: boolean;
    null_case?: boolean;
    primary_pattern?: string;
    secondary_pattern?: string;
    max_signature_strength?: number;
    fallback_applied?: boolean;
  };
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (key === "--in" && value) args.inputPath = value;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.inputPath);
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing packs file: ${inputPath}`);
    process.exit(1);
  }

  const packs = JSON.parse(fs.readFileSync(inputPath, "utf8")) as ScenarioPack[];
  if (!Array.isArray(packs) || packs.length === 0) {
    console.error("No scenario packs found.");
    process.exit(1);
  }

  const counts: Record<string, { train: number; eval: number }> = {};
  const evidenceCounts: Record<string, number> = {};
  let evidenceTotal = 0;
  let evidenceSamples = 0;
  let mixedCount = 0;
  let counterCount = 0;
  let overlapCount = 0;
  let fallbackCount = 0;
  let distinctiveHitCount = 0;
  const distinctiveByPattern: Record<string, { hit: number; total: number }> = {};

  for (const pack of packs) {
    const patternId = pack.expected.pattern_id;
    if (!counts[patternId]) counts[patternId] = { train: 0, eval: 0 };
    counts[patternId][pack.split] += 1;

    if (pack.meta?.mixed) mixedCount += 1;
    if (pack.meta?.counterexample) counterCount += 1;
    if (pack.meta?.fallback_applied) fallbackCount += 1;

    const evidence = pack.expected.conclusion_v1?.evidence_signals ?? [];
    if (Array.isArray(evidence)) {
      evidenceTotal += evidence.length;
      evidenceSamples += 1;
      for (const key of evidence) {
        evidenceCounts[key] = (evidenceCounts[key] ?? 0) + 1;
      }
      const distinctive = DISTINCTIVE_KEYS[patternId] ?? [];
      const hasDistinctive = evidence.some((key) => distinctive.includes(key));
      if (!distinctiveByPattern[patternId]) {
        distinctiveByPattern[patternId] = { hit: 0, total: 0 };
      }
      distinctiveByPattern[patternId].total += 1;
      if (hasDistinctive) {
        distinctiveByPattern[patternId].hit += 1;
        distinctiveHitCount += 1;
      }
    }

    const signals = pack.input_snapshot?.signals ?? {};
    const signatureHits = PATTERNS.filter(
      (pattern) =>
        pattern.pattern_id !== "low_impact_boundary" &&
        pattern.signature_strength(signals) >= 0.5
    ).length;
    if (signatureHits > 1) overlapCount += 1;
  }

  const avgEvidence = evidenceSamples > 0 ? evidenceTotal / evidenceSamples : 0;
  const distinctiveRate = packs.length > 0 ? distinctiveHitCount / packs.length : 0;
  const topEvidence = Object.entries(evidenceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, count]) => `${key}: ${count}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.resolve(`./ml_artifacts/scenario_coverage_${timestamp}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const lines = [
    "Scenario coverage report",
    "",
    `Total packs: ${packs.length}`,
    `Mixed cases: ${mixedCount} (${((mixedCount / packs.length) * 100).toFixed(1)}%)`,
    `Counterexamples: ${counterCount} (${((counterCount / packs.length) * 100).toFixed(1)}%)`,
    `Overlap (>1 signature): ${overlapCount} (${((overlapCount / packs.length) * 100).toFixed(1)}%)`,
    `Fallback applied: ${fallbackCount} (${((fallbackCount / packs.length) * 100).toFixed(1)}%)`,
    `Distinctive evidence rate: ${(distinctiveRate * 100).toFixed(1)}%`,
    "",
    "Counts per pattern (train/eval):",
    ...Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([patternId, split]) => `- ${patternId}: ${split.train}/${split.eval}`),
    "",
    `Evidence signals avg length: ${avgEvidence.toFixed(2)}`,
    "Distinctive evidence rate by pattern:",
    ...Object.entries(distinctiveByPattern)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([patternId, stats]) => {
        const rate = stats.total > 0 ? (stats.hit / stats.total) * 100 : 0;
        return `- ${patternId}: ${rate.toFixed(1)}%`;
      }),
    "Top evidence keys:",
    ...topEvidence.map((entry) => `- ${entry}`),
  ];

  fs.writeFileSync(outPath, `${lines.join("\n")}\n`);
  console.log(`wrote ${outPath}`);
  console.log(`fallback_applied_rate: ${((fallbackCount / packs.length) * 100).toFixed(1)}%`);
  console.log(`distinctive_evidence_rate: ${(distinctiveRate * 100).toFixed(1)}%`);
}

main();
