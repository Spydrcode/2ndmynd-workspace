#!/usr/bin/env node
/**
 * CLI for mockgen - mock dataset generator
 */

import { Command } from "commander";
import * as path from "path";
import { runPipeline } from "./run/run_pipeline";
import type { IndustryKey, ScenarioFlags } from "./types";

const program = new Command();

program
  .name("mockgen")
  .description("Backend-only mock dataset generator for 2ndmynd-workspace")
  .version("1.0.0");

// Safety check
const isProduction = process.env.NODE_ENV === "production";

program
  .command("one")
  .description("Generate a single mock dataset")
  .requiredOption("-i, --industry <industry>", "Industry: hvac|plumbing|electrical|landscaping|cleaning")
  .option("-s, --seed <number>", "Random seed (default: random)", String(Date.now()))
  .option("-d, --days <number>", "Days of data (default: 90)", "90")
  .option("--no-pipeline", "Skip running analysis pipeline")
  .option("--scenario <flags>", "Scenario flags: top_heavy,slow_pay,etc (comma-separated)")
  .option("--out <dir>", "Output directory (default: ./mock_runs)", "./mock_runs")
  .option("--force", "Allow in production (dangerous)")
  .action(async (options) => {
    if (isProduction && !options.force) {
      console.error("❌ Refusing to run in production. Use --force to override.");
      process.exit(1);
    }
    
    const industry = options.industry as IndustryKey;
    const seed = parseInt(options.seed);
    const days = parseInt(options.days);
    const runAnalysis = options.pipeline !== false;
    const outputDir = path.resolve(options.out);
    
    const scenario: ScenarioFlags = {};
    if (options.scenario) {
      const flags = options.scenario.split(",");
      for (const flag of flags) {
        scenario[flag.trim() as keyof ScenarioFlags] = true;
      }
    }
    
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
    
    const result = await runPipeline({
      industry,
      seed,
      days,
      startDate,
      endDate,
      scenario,
      runAnalysis,
      outputDir,
      searchApiKey: process.env.SERP_API_KEY,
    });
    
    console.log(`\n✅ Done!`);
    console.log(`   Bundle: ${result.bundlePath}`);
    console.log(`   Zip: ${result.zipPath}`);
    
    if (result.error) {
      console.error(`\n❌ Analysis failed: ${result.error}`);
      process.exit(1);
    }
  });

program
  .command("suite")
  .description("Generate one dataset per industry (5 total)")
  .option("-s, --seed <number>", "Base random seed (default: random)", String(Date.now()))
  .option("-d, --days <number>", "Days of data (default: 90)", "90")
  .option("--no-pipeline", "Skip running analysis pipeline")
  .option("--out <dir>", "Output directory (default: ./mock_runs)", "./mock_runs")
  .option("--force", "Allow in production (dangerous)")
  .action(async (options) => {
    if (isProduction && !options.force) {
      console.error("❌ Refusing to run in production. Use --force to override.");
      process.exit(1);
    }
    
    const industries: IndustryKey[] = ["hvac", "plumbing", "electrical", "landscaping", "cleaning"];
    const baseSeed = parseInt(options.seed);
    const days = parseInt(options.days);
    const runAnalysis = options.pipeline !== false;
    const outputDir = path.resolve(options.out);
    
    console.log(`\n🔄 Running suite: ${industries.length} industries...\n`);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    for (let i = 0; i < industries.length; i++) {
      const industry = industries[i];
      const seed = baseSeed + i;
      
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);
      
      const result = await runPipeline({
        industry,
        seed,
        days,
        startDate,
        endDate,
        runAnalysis,
        outputDir,
        searchApiKey: process.env.SERP_API_KEY,
      });
      
      results.push({ industry, result });
    }
    
    console.log(`\n✅ Suite complete! Generated ${results.length} datasets.\n`);
    
    // Print summary table
    console.log("| Industry     | Quotes | Jobs | Invoices | Status |");
    console.log("|--------------|--------|------|----------|--------|");
    for (const { industry, result } of results) {
      const status = result.error ? "❌ Failed" : "✅ OK";
      console.log(
        `| ${industry.padEnd(12)} | ${String(result.manifest.counts.quotes).padStart(6)} | ${String(result.manifest.counts.jobs).padStart(4)} | ${String(result.manifest.counts.invoices).padStart(8)} | ${status} |`
      );
    }
    console.log("");
  });

program
  .command("sweep")
  .description("Sweep scenarios across seeds for one industry")
  .requiredOption("-i, --industry <industry>", "Industry: hvac|plumbing|electrical|landscaping|cleaning")
  .option("--seeds <count>", "Number of seeds to sweep (default: 10)", "10")
  .option("-d, --days <number>", "Days of data (default: 90)", "90")
  .option("--no-pipeline", "Skip running analysis pipeline")
  .option("--out <dir>", "Output directory (default: ./mock_runs)", "./mock_runs")
  .option("--force", "Allow in production (dangerous)")
  .action(async (options) => {
    if (isProduction && !options.force) {
      console.error("❌ Refusing to run in production. Use --force to override.");
      process.exit(1);
    }
    
    const industry = options.industry as IndustryKey;
    const seedCount = parseInt(options.seeds);
    const days = parseInt(options.days);
    const runAnalysis = options.pipeline !== false;
    const outputDir = path.resolve(options.out);
    
    console.log(`\n🔄 Sweeping ${industry}: ${seedCount} seeds...\n`);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    for (let i = 0; i < seedCount; i++) {
      const seed = Date.now() + i * 1000;
      
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);
      
      const result = await runPipeline({
        industry,
        seed,
        days,
        startDate,
        endDate,
        runAnalysis,
        outputDir,
        searchApiKey: process.env.SERP_API_KEY,
      });
      
      results.push({ seed, result });
    }
    
    console.log(`\n✅ Sweep complete! Generated ${results.length} datasets.\n`);
    
    // Print summary
    console.log("| Seed        | Quotes | Jobs | Invoices | Status |");
    console.log("|-------------|--------|------|----------|--------|");
    for (const { seed, result } of results) {
      const status = result.error ? "❌ Failed" : "✅ OK";
      console.log(
        `| ${String(seed).padEnd(11)} | ${String(result.manifest.counts.quotes).padStart(6)} | ${String(result.manifest.counts.jobs).padStart(4)} | ${String(result.manifest.counts.invoices).padStart(8)} | ${status} |`
      );
    }
    console.log("");
  });

program
  .command("run")
  .description("Run analysis on existing bundle zip")
  .requiredOption("-z, --zip <path>", "Path to bundle zip file")
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (_options) => {
    console.log("❌ Not implemented yet. Use 'one --no-pipeline' to generate without analysis.");
    process.exit(1);
  });

program.parse(process.argv);
