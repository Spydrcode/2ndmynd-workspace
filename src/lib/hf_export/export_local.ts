/**
 * Export Local HF Bundle
 * 
 * Writes privacy-safe dataset bundles to local filesystem.
 * Outputs:
 * - dataset.jsonl (newline-delimited JSON rows)
 * - dataset_info.json (metadata including schema hash)
 * - splits/*.jsonl (if split_strategy != "none")
 */

import { promises as fs } from "fs";
import path from "path";
import type { TrainingExampleV1 } from "../learning/types";
import { buildHFDatasetRowV1 } from "./build_dataset_row";
import { getHFExportConfig, type HFExportBundleInfo, type HFDatasetRowV1 } from "./types";
import { execSync } from "child_process";

/**
 * Export Local HF Bundle
 * 
 * @param examples - Training examples to export
 * @param options - Export options
 * @returns Path to bundle directory
 */
export async function exportLocalHFBundle(
  examples: TrainingExampleV1[],
  options: {
    outDir?: string;
    splitStrategy?: "none" | "by_source" | "by_industry" | "by_source_industry";
    maxRows?: number;
  } = {}
): Promise<string> {
  const config = getHFExportConfig();
  const outDir = options.outDir ?? config.outDir;
  const splitStrategy = options.splitStrategy ?? config.splitStrategy;
  const maxRows = options.maxRows ?? config.maxRows;
  
  // Limit examples if needed
  const limitedExamples = examples.slice(0, maxRows);
  
  console.log(`[HF Export] Building dataset with ${limitedExamples.length} examples...`);
  
  // Convert to HF rows (will throw if PII detected)
  const rows: HFDatasetRowV1[] = [];
  let piiErrors = 0;
  
  for (const example of limitedExamples) {
    try {
      const row = buildHFDatasetRowV1(example);
      rows.push(row);
    } catch (err) {
      piiErrors++;
      console.error(`[HF Export] Failed to convert example ${example.id}:`, err);
      // Do not include rows that fail PII guard
    }
  }
  
  if (piiErrors > 0) {
    throw new Error(`HF Export aborted: ${piiErrors} examples failed PII guard`);
  }
  
  if (rows.length === 0) {
    throw new Error("HF Export aborted: no valid rows to export");
  }
  
  console.log(`[HF Export] ${rows.length} rows passed PII guards`);
  
  // Compute metadata
  const by_source: Record<string, number> = {};
  const by_industry: Record<string, number> = {};
  
  for (const row of rows) {
    by_source[row.source] = (by_source[row.source] ?? 0) + 1;
    by_industry[row.industry_key] = (by_industry[row.industry_key] ?? 0) + 1;
  }
  
  // Get git SHA if available
  let git_sha: string | undefined;
  try {
    git_sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    git_sha = undefined;
  }
  
  const schema_hash = rows[0].schema_hash;
  const feature_keys = Object.keys(rows[0].features).sort();
  
  // Create output directory
  await fs.mkdir(outDir, { recursive: true });
  
  // Write main dataset.jsonl
  const datasetPath = path.join(outDir, "dataset.jsonl");
  const datasetLines = rows.map((row) => JSON.stringify(row)).join("\n");
  await fs.writeFile(datasetPath, datasetLines + "\n", "utf-8");
  console.log(`[HF Export] Wrote ${rows.length} rows to ${datasetPath}`);
  
  // Write splits if needed
  const splits: Record<string, number> = {};
  
  if (splitStrategy !== "none") {
    const splitsDir = path.join(outDir, "splits");
    await fs.mkdir(splitsDir, { recursive: true });
    
    if (splitStrategy === "by_source") {
      for (const [source, count] of Object.entries(by_source)) {
        const splitRows = rows.filter((r) => r.source === source);
        const splitPath = path.join(splitsDir, `${source}.jsonl`);
        const splitLines = splitRows.map((r) => JSON.stringify(r)).join("\n");
        await fs.writeFile(splitPath, splitLines + "\n", "utf-8");
        splits[source] = splitRows.length;
        console.log(`[HF Export] Split: ${source} (${count} rows)`);
      }
    } else if (splitStrategy === "by_industry") {
      for (const [industry, count] of Object.entries(by_industry)) {
        const splitRows = rows.filter((r) => r.industry_key === industry);
        const splitPath = path.join(splitsDir, `${industry}.jsonl`);
        const splitLines = splitRows.map((r) => JSON.stringify(r)).join("\n");
        await fs.writeFile(splitPath, splitLines + "\n", "utf-8");
        splits[industry] = splitRows.length;
        console.log(`[HF Export] Split: ${industry} (${count} rows)`);
      }
    } else if (splitStrategy === "by_source_industry") {
      for (const [source] of Object.entries(by_source)) {
        for (const [industry] of Object.entries(by_industry)) {
          const splitRows = rows.filter((r) => r.source === source && r.industry_key === industry);
          if (splitRows.length > 0) {
            const splitName = `${source}_${industry}`;
            const splitPath = path.join(splitsDir, `${splitName}.jsonl`);
            const splitLines = splitRows.map((r) => JSON.stringify(r)).join("\n");
            await fs.writeFile(splitPath, splitLines + "\n", "utf-8");
            splits[splitName] = splitRows.length;
            console.log(`[HF Export] Split: ${splitName} (${splitRows.length} rows)`);
          }
        }
      }
    }
  }
  
  // Write dataset_info.json
  const info: HFExportBundleInfo = {
    generated_at: new Date().toISOString(),
    schema_version: "signals_v1",
    schema_hash,
    feature_keys,
    total_rows: rows.length,
    by_source,
    by_industry,
    splits: Object.keys(splits).length > 0 ? splits : undefined,
    git_sha,
  };
  
  const infoPath = path.join(outDir, "dataset_info.json");
  await fs.writeFile(infoPath, JSON.stringify(info, null, 2) + "\n", "utf-8");
  console.log(`[HF Export] Wrote metadata to ${infoPath}`);
  
  console.log(`[HF Export] Bundle complete: ${outDir}`);
  return outDir;
}
