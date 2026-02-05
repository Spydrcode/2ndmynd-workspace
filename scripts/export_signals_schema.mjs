#!/usr/bin/env node
/**
 * Export Signals V1 Schema to JSON
 * 
 * Generates a canonical schema file for Python consumption.
 * This ensures Python training/inference uses EXACT SAME features as TypeScript.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";

// Extract SIGNALS_V1_KEYS from the TypeScript source
const signalsSource = readFileSync("./src/lib/learning/signals_v1.ts", "utf-8");
const keysMatch = signalsSource.match(/export const SIGNALS_V1_KEYS = \[([\s\S]*?)\] as const;/);
if (!keysMatch) {
  console.error("❌ Failed to extract SIGNALS_V1_KEYS from source");
  process.exit(1);
}

// Parse the keys array
const keysString = keysMatch[1];
const featureKeys = keysString
  .split("\n")
  .map(line => line.trim())
  .filter(line => line.startsWith('"'))
  .map(line => line.match(/"([^"]+)"/)?.[1])
  .filter(Boolean);

// Compute schema hash
const schemaHash = createHash("sha256")
  .update(featureKeys.join(","))
  .digest("hex")
  .substring(0, 8);

const schema = {
  schema_version: "signals_v1",
  feature_keys: featureKeys,
  schema_hash: schemaHash,
  exported_at: new Date().toISOString(),
};

mkdirSync("./ml/schemas", { recursive: true });
const outPath = "./ml/schemas/signals_v1_schema.json";
writeFileSync(outPath, JSON.stringify(schema, null, 2));

console.log(`✅ Exported signals_v1 schema to ${outPath}`);
console.log(`   Schema hash: ${schema.schema_hash}`);
console.log(`   Features: ${schema.feature_keys.length}`);

