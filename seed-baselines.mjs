#!/usr/bin/env node
/**
 * Seed Industry Baselines - Verify baseline files and report status
 * 
 * Usage: node seed-baselines.mjs
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASELINES_DIR = join(__dirname, "fixtures", "baselines");

// Industry priority list (from industry_index.ts)
const PRIORITY_INDUSTRIES = [
  "home_services",
  "professional_services",
  "field_services",
  "construction",
];

function loadBaselines() {
  if (!existsSync(BASELINES_DIR)) {
    console.error(`❌ Baselines directory not found: ${BASELINES_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(BASELINES_DIR).filter((f) => f.endsWith(".json"));
  const baselines = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(BASELINES_DIR, file), "utf-8");
      const data = JSON.parse(content);
      baselines.push({ filename: file, data });
    } catch (error) {
      console.warn(`⚠️  Failed to load ${file}:`, error.message);
    }
  }

  return baselines;
}

function validateBaseline(data) {
  const required = [
    "cohort_id",
    "cohort_label",
    "version",
    "sample_size",
    "industry_bucket",
    "job_value_distribution",
    "revenue_concentration",
    "cycle_time_medians",
  ];

  const missing = required.filter((field) => !(field in data));
  return { valid: missing.length === 0, missing };
}

function main() {
  console.log("🌱 Seeding Industry Baselines\n");
  console.log(`📂 Baselines directory: ${BASELINES_DIR}\n`);

  const baselines = loadBaselines();
  console.log(`✅ Loaded ${baselines.length} baseline file(s)\n`);

  // Check priority industries
  console.log("📊 Priority Industry Status:");
  for (const industry of PRIORITY_INDUSTRIES) {
    const filename = `${industry}_v1.json`;
    const baseline = baselines.find((b) => b.filename === filename);

    if (!baseline) {
      console.log(`  ❌ ${industry}: MISSING`);
      continue;
    }

    const validation = validateBaseline(baseline.data);
    if (!validation.valid) {
      console.log(`  ⚠️  ${industry}: INVALID (missing: ${validation.missing.join(", ")})`);
      continue;
    }

    console.log(
      `  ✅ ${industry}: Ready (n=${baseline.data.sample_size}, ${baseline.data.cohort_label})`
    );
  }

  // Summary
  console.log("\n📈 Baseline Summary:");
  for (const baseline of baselines) {
    const data = baseline.data;
    const validation = validateBaseline(data);
    
    if (validation.valid) {
      console.log(`  • ${data.cohort_label}`);
      console.log(`    - Sample size: ${data.sample_size}`);
      console.log(`    - Top 5 concentration: ${(data.revenue_concentration.top_5_jobs_share * 100).toFixed(0)}%`);
      console.log(`    - Quote→Job median: ${data.cycle_time_medians.quote_to_job_days} days`);
      if (data.notes) {
        console.log(`    - Notes: ${data.notes}`);
      }
      console.log("");
    }
  }

  console.log("✅ Baseline seeding complete!");
}

main();
