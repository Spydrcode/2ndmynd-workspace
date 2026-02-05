/**
 * RAG Seed Ingestion Script
 * 
 * Ingests ALL industry baselines from the canonical index + tool playbook into RAG.
 * 
 * Usage:
 *   npm run rag:seed
 *   or
 *   node --loader tsx scripts/rag_seed_ingest.ts
 */

import fs from "node:fs";
import path from "node:path";
import { ingestRagDocsBatch } from "../src/lib/rag/ingest";
import type { RagDocInput } from "../src/lib/rag/types";
import { OWNER_LED_INDUSTRIES, getAllIndustryKeys } from "../rag_seed/industry_index";

const RAG_SEED_DIR = path.join(process.cwd(), "rag_seed");
const INDUSTRIES_DIR = path.join(RAG_SEED_DIR, "industries");

async function main() {
  console.log("🌱 Starting comprehensive RAG seed ingestion...");
  console.log(`Reading from: ${RAG_SEED_DIR}`);

  const docs: RagDocInput[] = [];
  
  // 1. Load ALL industry baselines from canonical index
  const allIndustryKeys = getAllIndustryKeys();
  let loadedCount = 0;
  let skippedCount = 0;

  for (const industryKey of allIndustryKeys) {
    const industryFilePath = path.join(INDUSTRIES_DIR, `${industryKey}.md`);

    if (fs.existsSync(industryFilePath)) {
      const content = fs.readFileSync(industryFilePath, "utf-8");
      
      // Find the category for proper tagging
      let category = "unknown";
      for (const [cat, industries] of Object.entries(OWNER_LED_INDUSTRIES)) {
        if ((industries as readonly string[]).includes(industryKey)) {
          category = cat;
          break;
        }
      }

      docs.push({
        text: content,
        metadata: {
          workspace_id: "global", // Curated baselines are global
          industry_key: industryKey,
          doc_type: "industry_baseline",
          source: "curated",
          created_at: new Date().toISOString(),
        },
      });
      
      console.log(`  ✓ Loaded: ${industryKey} (${category})`);
      loadedCount++;
    } else {
      console.warn(`  ⚠️  Missing: ${industryKey} (expected at industries/${industryKey}.md)`);
      skippedCount++;
    }
  }

  // 2. Load cross-industry tool playbook
  const toolPlaybookPath = path.join(RAG_SEED_DIR, "tool_playbook.md");
  if (fs.existsSync(toolPlaybookPath)) {
    const toolPlaybook = fs.readFileSync(toolPlaybookPath, "utf-8");
    docs.push({
      text: toolPlaybook,
      metadata: {
        workspace_id: "global",
        industry_key: undefined,
        doc_type: "tool_playbook",
        source: "curated",
        created_at: new Date().toISOString(),
      },
    });
    console.log(`  ✓ Loaded: tool_playbook (cross-industry)`);
  } else {
    console.warn("  ⚠️  Tool playbook not found");
  }

  if (docs.length === 0) {
    console.error("❌ No documents found to ingest. Check rag_seed/industries/ directory.");
    process.exit(1);
  }

  console.log(`\n📦 Ingesting ${docs.length} documents...`);

  const result = await ingestRagDocsBatch(docs);

  console.log(`\n✅ RAG seed ingest complete!`);
  console.log(`📊 Summary:`);
  console.log(`   - Industry baselines loaded: ${loadedCount}`);
  console.log(`   - Industry baselines skipped: ${skippedCount}`);
  console.log(`   - Tool playbook: ${fs.existsSync(toolPlaybookPath) ? "✓" : "✗"}`);
  console.log(`   - Total documents ingested: ${result.count}\n`);
  
  if (skippedCount > 0) {
    console.log(`⚠️  ${skippedCount} industries are missing baseline documents.`);
    console.log(`   Create them in rag_seed/industries/ following the canonical format.\n`);
  }
}

main().catch((error) => {
  console.error("❌ RAG seed ingestion failed:");
  console.error(error);
  process.exit(1);
});
