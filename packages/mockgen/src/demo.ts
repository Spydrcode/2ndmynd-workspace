/**
 * Quick demo/smoke test for mockgen
 */

import { runPipeline } from "./run/run_pipeline";
import * as path from "path";

async function main() {
  console.log("🚀 Mock Dataset Generator - Quick Demo\n");
  
  const outputDir = path.join(process.cwd(), "mock_runs");
  
  console.log("Generating HVAC dataset...");
  const result = await runPipeline({
    industry: "hvac",
    seed: 42,
    days: 30,
    startDate: new Date("2024-01-01"),
    endDate: new Date("2024-01-31"),
    runAnalysis: false, // Skip analysis for demo
    outputDir,
    searchApiKey: process.env.SERP_API_KEY,
  });
  
  console.log("\n✅ Demo complete!");
  console.log(`\nGenerated:`);
  console.log(`  - ${result.manifest.counts.customers} customers`);
  console.log(`  - ${result.manifest.counts.quotes} quotes`);
  console.log(`  - ${result.manifest.counts.jobs} jobs`);
  console.log(`  - ${result.manifest.counts.invoices} invoices`);
  console.log(`\nFiles created:`);
  console.log(`  - ${result.bundlePath}/`);
  console.log(`  - ${result.zipPath}`);
  console.log(`\nCheck the bundle for CSV exports, manifest, and summary!`);
}

main().catch((err) => {
  console.error("❌ Demo failed:", err);
  process.exit(1);
});
