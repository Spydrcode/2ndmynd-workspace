/**
 * Pipeline runner - generates bundle, runs analysis, saves artifacts
 */

import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import { generateDataset } from "../generate/generator";
import { exportQuotesCSV } from "../generate/exporters/quotes";
import { exportInvoicesCSV } from "../generate/exporters/invoices";
import { exportCalendarCSV } from "../generate/exporters/calendar";
import { findBusinessSite } from "../web/find_site";
import { scrapeSite, type WebsiteContext } from "../web/scrape_site";
import { getIndustryTemplate } from "../industries";
import type { GenerationOptions, PipelineResult, BundleManifest } from "../types";

export interface PipelineOptions extends GenerationOptions {
  runAnalysis: boolean;
  outputDir: string;
  searchApiKey?: string;
}

/**
 * Run full pipeline: generate → export → zip → analyze → save
 */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const template = getIndustryTemplate(options.industry);
  const startTime = Date.now();
  
  console.log(`[mockgen] Generating ${options.industry} dataset (seed=${options.seed}, days=${options.days})...`);
  
  // 1. Find website
  const serviceArea = template.serviceAreas[0];
  const siteResult = await findBusinessSite(options.industry, serviceArea, options.searchApiKey);
  let websiteContext: WebsiteContext | undefined;
  
  if (siteResult) {
    console.log(`[mockgen] Found website: ${siteResult.url}`);
    const scraped = await scrapeSite(siteResult.url);
    if (scraped) {
      websiteContext = scraped;
      console.log(`[mockgen] Scraped business: ${scraped.businessName} (${scraped.city}, ${scraped.state})`);
    }
  } else {
    console.log(`[mockgen] No website found, using synthetic data`);
  }
  
  // 2. Generate dataset
  const dataset = await generateDataset(options);
  
  console.log(`[mockgen] Generated:`);
  console.log(`  - ${dataset.customers.length} customers`);
  console.log(`  - ${dataset.quotes.length} quotes`);
  console.log(`  - ${dataset.jobs.length} jobs`);
  console.log(`  - ${dataset.invoices.length} invoices`);
  console.log(`  - ${dataset.calendar_events.length} calendar events`);
  
  // 3. Export to CSV
  const quotesCSV = exportQuotesCSV(dataset);
  const invoicesCSV = exportInvoicesCSV(dataset);
  const calendarCSV = exportCalendarCSV(dataset);
  
  // 4. Create bundle directory
  const websiteSlug = websiteContext
    ? websiteContext.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "synthetic";
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const bundleName = `${options.industry}-${websiteSlug}-${timestamp}-seed${options.seed}`;
  const bundleDir = path.join(options.outputDir, bundleName);
  
  fs.mkdirSync(bundleDir, { recursive: true });
  
  // 5. Write CSV files
  fs.writeFileSync(path.join(bundleDir, "quotes_export.csv"), quotesCSV);
  fs.writeFileSync(path.join(bundleDir, "invoices_export.csv"), invoicesCSV);
  fs.writeFileSync(path.join(bundleDir, "calendar_export.csv"), calendarCSV);
  
  // 6. Write manifest
  const manifest: BundleManifest = {
    industry: options.industry,
    seed: options.seed,
    days: options.days,
    startDate: options.startDate.toISOString(),
    endDate: options.endDate.toISOString(),
    scenario: options.scenario ?? {},
    websiteContext,
    generatedAt: new Date().toISOString(),
    counts: {
      customers: dataset.customers.length,
      quotes: dataset.quotes.length,
      jobs: dataset.jobs.length,
      invoices: dataset.invoices.length,
      calendar_events: dataset.calendar_events.length,
    },
  };
  
  fs.writeFileSync(
    path.join(bundleDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  
  // 7. Create zip
  const zip = new AdmZip();
  zip.addLocalFolder(bundleDir);
  const zipPath = `${bundleDir}.zip`;
  zip.writeZip(zipPath);
  
  console.log(`[mockgen] Bundle created: ${zipPath}`);
  
  // 8. Run analysis if requested
  let analysisResult: any;
  let error: string | undefined;
  
  if (options.runAnalysis) {
    console.log(`[mockgen] Running analysis pipeline...`);
    try {
      // Import analysis function dynamically to avoid Next.js imports
      // User's existing analysis function should be in lib/intelligence/run_analysis.ts
      // We'll invoke it via Node.js dynamic import
      const { runAnalysisFromPack } = await import("../../../lib/intelligence/run_analysis");
      
      const result = await runAnalysisFromPack({
        quotesPath: path.join(bundleDir, "quotes_export.csv"),
        invoicesPath: path.join(bundleDir, "invoices_export.csv"),
        calendarPath: path.join(bundleDir, "calendar_export.csv"),
        startDate: options.startDate,
        endDate: options.endDate,
      });
      
      analysisResult = result;
      
      // Save analysis artifacts
      fs.writeFileSync(
        path.join(bundleDir, "analysis_result.json"),
        JSON.stringify(result, null, 2)
      );
      
      console.log(`[mockgen] Analysis complete. Signals:`);
      if (result.signals) {
        for (const [key, value] of Object.entries(result.signals)) {
          console.log(`  - ${key}: ${JSON.stringify(value)}`);
        }
      }
    } catch (err) {
      error = String(err);
      console.error(`[mockgen] Analysis failed: ${error}`);
    }
  }
  
  // 9. Write summary
  const summary = generateSummary(manifest, analysisResult, Date.now() - startTime);
  fs.writeFileSync(path.join(bundleDir, "run_summary.md"), summary);
  
  return {
    bundlePath: bundleDir,
    zipPath,
    manifest,
    analysisResult,
    error,
  };
}

function generateSummary(
  manifest: BundleManifest,
  analysisResult: any,
  durationMs: number
): string {
  const lines: string[] = [];
  
  lines.push(`# Mock Dataset Summary`);
  lines.push(``);
  lines.push(`**Industry**: ${manifest.industry}`);
  lines.push(`**Seed**: ${manifest.seed}`);
  lines.push(`**Window**: ${manifest.startDate.substring(0, 10)} to ${manifest.endDate.substring(0, 10)} (${manifest.days} days)`);
  lines.push(`**Generated**: ${manifest.generatedAt}`);
  lines.push(`**Duration**: ${(durationMs / 1000).toFixed(2)}s`);
  lines.push(``);
  
  if (manifest.websiteContext) {
    lines.push(`## Website Context`);
    lines.push(``);
    lines.push(`- **Business**: ${manifest.websiteContext.businessName}`);
    lines.push(`- **Location**: ${manifest.websiteContext.city}, ${manifest.websiteContext.state}`);
    lines.push(`- **URL**: ${manifest.websiteContext.url}`);
    lines.push(`- **Keywords**: ${manifest.websiteContext.serviceKeywords.join(", ")}`);
    lines.push(``);
  }
  
  lines.push(`## Dataset Counts`);
  lines.push(``);
  lines.push(`| Entity | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Customers | ${manifest.counts.customers} |`);
  lines.push(`| Quotes | ${manifest.counts.quotes} |`);
  lines.push(`| Jobs | ${manifest.counts.jobs} |`);
  lines.push(`| Invoices | ${manifest.counts.invoices} |`);
  lines.push(`| Calendar Events | ${manifest.counts.calendar_events} |`);
  lines.push(``);
  
  if (manifest.scenario && Object.keys(manifest.scenario).length > 0) {
    lines.push(`## Scenario Flags`);
    lines.push(``);
    for (const [key, value] of Object.entries(manifest.scenario)) {
      if (value) lines.push(`- ✅ ${key}`);
    }
    lines.push(``);
  }
  
  if (analysisResult) {
    lines.push(`## Analysis Results`);
    lines.push(``);
    
    if (analysisResult.signals) {
      lines.push(`### Signals`);
      lines.push(``);
      for (const [key, value] of Object.entries(analysisResult.signals)) {
        lines.push(`- **${key}**: \`${JSON.stringify(value)}\``);
      }
      lines.push(``);
    }
    
    if (analysisResult.snapshot) {
      const snap = analysisResult.snapshot;
      lines.push(`### Snapshot`);
      lines.push(``);
      lines.push(`- **Total Revenue**: $${snap.total_revenue?.toFixed(2) ?? "N/A"}`);
      lines.push(`- **Outstanding AR**: $${snap.outstanding_ar?.toFixed(2) ?? "N/A"}`);
      lines.push(`- **Quote Count**: ${snap.quote_count ?? "N/A"}`);
      lines.push(`- **Job Count**: ${snap.job_count ?? "N/A"}`);
      lines.push(``);
    }
  }
  
  return lines.join("\n");
}
