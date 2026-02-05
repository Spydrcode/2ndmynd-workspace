#!/usr/bin/env node
/**
 * Export Signals Dataset to HF Format
 * 
 * CLI for exporting training examples to Hugging Face dataset format.
 * 
 * Usage:
 *   npm run hf:export -- --source=mock --industry=hvac --max-rows=1000
 *   npm run hf:export -- --push
 * 
 * Options:
 *   --source=<mock|real>     Filter by source
 *   --industry=<key>         Filter by industry
 *   --max-rows=<n>           Limit rows (default: 50000)
 *   --out-dir=<path>         Output directory (default: runs/hf_export)
 *   --split=<strategy>       Split strategy: none|by_source|by_industry|by_source_industry
 *   --push                   Push to HF Hub after export
 *   --repo=<owner/name>      HF repo (default: 2ndmynd/signals_v1_private)
 */

import { promises as fs } from "fs";
import path from "path";
import { exportLocalHFBundle } from "../../src/lib/hf_export/export_local";
import { pushToHF } from "../../src/lib/hf_export/push_to_hf";
import type { TrainingExampleV1, IndustryKey, LearningSource } from "../../src/lib/learning/types";

async function loadExamples(filters: {
  source?: LearningSource;
  industry?: IndustryKey;
}): Promise<TrainingExampleV1[]> {
  // Load from standard training data directory
  const dataDir = path.resolve(process.cwd(), "data/learning/train");
  
  console.log(`[CLI] Loading examples from ${dataDir}...`);
  
  let files: string[] = [];
  try {
    files = await fs.readdir(dataDir);
  } catch {
    console.warn(`[CLI] No training data found at ${dataDir}`);
    return [];
  }
  
  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
  
  if (jsonlFiles.length === 0) {
    console.warn(`[CLI] No .jsonl files found in ${dataDir}`);
    return [];
  }
  
  const examples: TrainingExampleV1[] = [];
  
  for (const file of jsonlFiles) {
    const filePath = path.join(dataDir, file);
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());
    
    for (const line of lines) {
      try {
        const example = JSON.parse(line) as TrainingExampleV1;
        
        // Apply filters
        if (filters.source && example.source !== filters.source) {
          continue;
        }
        if (filters.industry && example.industry_key !== filters.industry) {
          continue;
        }
        
        examples.push(example);
      } catch (err) {
        console.error(`[CLI] Failed to parse line in ${file}:`, err);
      }
    }
  }
  
  console.log(`[CLI] Loaded ${examples.length} examples (${jsonlFiles.length} files)`);
  return examples;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const source = args.find((a) => a.startsWith("--source="))?.split("=")[1] as LearningSource | undefined;
  const industry = args.find((a) => a.startsWith("--industry="))?.split("=")[1] as IndustryKey | undefined;
  const maxRows = parseInt(args.find((a) => a.startsWith("--max-rows="))?.split("=")[1] ?? "50000", 10);
  const outDir = args.find((a) => a.startsWith("--out-dir="))?.split("=")[1];
  const split = args.find((a) => a.startsWith("--split="))?.split("=")[1] as "none" | "by_source" | "by_industry" | "by_source_industry" | undefined;
  const push = args.includes("--push");
  const repo = args.find((a) => a.startsWith("--repo="))?.split("=")[1];
  
  console.log(`[CLI] HF Export Starting`);
  console.log(`  Source: ${source ?? "all"}`);
  console.log(`  Industry: ${industry ?? "all"}`);
  console.log(`  Max Rows: ${maxRows}`);
  console.log(`  Out Dir: ${outDir ?? "runs/hf_export"}`);
  console.log(`  Split: ${split ?? "by_source_industry"}`);
  console.log(`  Push: ${push}`);
  
  // Load examples
  const examples = await loadExamples({ source, industry });
  
  if (examples.length === 0) {
    console.error("[CLI] No examples found. Run training pipeline first.");
    process.exit(1);
  }
  
  // Export bundle
  try {
    const bundleDir = await exportLocalHFBundle(examples, {
      outDir,
      splitStrategy: split,
      maxRows,
    });
    
    console.log(`[CLI] ✓ Bundle created: ${bundleDir}`);
    
    // Push to HF if requested
    if (push) {
      const result = await pushToHF(bundleDir, { repo });
      
      if (result.pushed) {
        console.log(`[CLI] ✓ Pushed to HF (revision=${result.revision})`);
      } else {
        console.error(`[CLI] ✗ Push failed: ${result.error}`);
        process.exit(1);
      }
    }
    
    console.log(`[CLI] HF Export Complete`);
  } catch (err) {
    console.error(`[CLI] Export failed:`, err);
    process.exit(1);
  }
}

main();
