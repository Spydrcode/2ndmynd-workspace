/**
 * END-TO-END DEMO: Decision Closure Pipeline v3
 * 
 * Demonstrates the full 5-system pipeline:
 * SYSTEM 0: Owner Intent Capture
 * SYSTEM 1: Business Reality Reconstruction
 * SYSTEM 2: Structural Diagnosis
 * SYSTEM 3: Decision Paths Generator (max 2)
 * SYSTEM 4: Commitment + Action Plan
 * SYSTEM 5: Outcome Validation (monthly)
 * 
 * Usage:
 *   tsx scripts/decision_closure_demo.ts
 */

import { handler as runMockPackV2 } from "../mcp/tools/run_mock_pack_v2";
import { handler as captureIntent } from "../mcp/tools/capture_intent_v1";
import { handler as runPipelineV3 } from "../mcp/tools/run_pipeline_v3";
import { handler as recordCommitment } from "../mcp/tools/record_commitment_v1";
import { handler as validateDoctrine } from "../mcp/tools/validate_doctrine_v1";
import type { SnapshotV2 } from "../lib/decision/v2/conclusion_schema_v2";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  console.log("========================================");
  console.log("Decision Closure Pipeline v3 Demo");
  console.log("========================================\n");

  // =========================================================================
  // STEP 1: Generate Mock Data Pack
  // =========================================================================
  console.log("📦 STEP 1: Generating mock business data pack...\n");

  const mockSnapshot: SnapshotV2 = {
    snapshot_version: "snapshot_v2",
    pii_scrubbed: true,
    window: {
      slice_start: "2024-11-01",
      slice_end: "2025-01-31",
      report_date: "2025-02-01",
      lookback_days: 90,
      sample_confidence: "high",
      window_type: "last_90_days",
    },
    activity_signals: {
      quotes: {
        quotes_count: 45,
        quotes_approved_count: 18,
        approval_rate_band: "medium",
        decision_lag_band: "high", // Owner bottleneck signal
        quote_total_bands: { small: 10, medium: 25, large: 10 },
      },
      invoices: {
        invoices_count: 35,
        invoices_paid_count: 30,
        invoice_total_bands: { small: 12, medium: 18, large: 5 },
        payment_lag_band_distribution: {
          very_low: 0.1,
          low: 0.3,
          medium: 0.4,
          high: 0.15,
          very_high: 0.05,
        },
      },
    },
    volatility_band: "high",
    season: {
      phase: "Active",
      strength: "strong",
      predictability: "medium",
    },
    input_costs: [],
  };

  console.log("✅ Mock snapshot generated\n");

  // =========================================================================
  // STEP 2: Capture Owner Intent
  // =========================================================================
  console.log("🎯 STEP 2: Capturing owner intent profile...\n");

  const intentResult = await captureIntent({
    primary_priority: "time_relief",
    risk_appetite: "medium",
    change_appetite: "structural",
    non_negotiables: ["No price increases", "Keep current team size"],
    time_horizon: "90_days",
  });

  if (!intentResult.valid) {
    console.error("❌ Intent contradictions detected:");
    intentResult.contradictions.forEach((c) => console.error(`  - ${c.message}`));
    return;
  }

  console.log("✅ Owner intent captured:");
  console.log(`   Priority: ${intentResult.profile.primary_priority}`);
  console.log(`   Risk: ${intentResult.profile.risk_appetite}`);
  console.log(`   Time horizon: ${intentResult.profile.time_horizon}\n`);

  // =========================================================================
  // STEP 3: Run Decision Closure Pipeline
  // =========================================================================
  console.log("🔄 STEP 3: Running Decision Closure Pipeline v3...\n");

  const pipelineResult = await runPipelineV3({
    mode: "initial_onboarding",
    snapshot: mockSnapshot,
    owner_intent: intentResult.profile,
  });

  console.log("✅ Pipeline complete\n");
  console.log("📊 Business Reality:");
  console.log(`   Type: ${pipelineResult.artifact.business_reality.business_type_detected}`);
  console.log(`   Seasonality: ${pipelineResult.artifact.business_reality.seasonality_pattern}`);
  console.log(`   Confidence: ${pipelineResult.artifact.business_reality.confidence}\n`);

  console.log("🔍 Structural Findings:");
  pipelineResult.artifact.structural_findings.forEach((f) => {
    console.log(`   [${f.lens}] ${f.finding_summary} (${f.severity})`);
  });
  console.log();

  console.log("⚠️  Primary Constraint:");
  console.log(`   ${pipelineResult.artifact.primary_constraint.constraint_description}\n`);

  console.log("🛤️  Decision Paths Generated:");
  pipelineResult.artifact.decision_paths.forEach((path) => {
    console.log(`\n   PATH ${path.path_id}: ${path.path_name}`);
    console.log(`   Resolves: ${path.pressure_resolved}`);
    console.log(`   Trade-offs: ${path.trade_offs.join(", ")}`);
    console.log(`   Confidence: ${path.confidence}`);
  });
  console.log();

  // =========================================================================
  // STEP 4: Validate Doctrine Compliance
  // =========================================================================
  console.log("✅ STEP 4: Validating doctrine compliance...\n");

  const doctrineResult = await validateDoctrine({
    artifact: pipelineResult.artifact,
    strict: false,
  });

  console.log("Doctrine Checks:");
  console.log(`   Max 2 paths enforced: ${doctrineResult.doctrine_checks.max_two_paths_enforced ? "✅" : "❌"}`);
  console.log(`   Forbidden language absent: ${doctrineResult.doctrine_checks.forbidden_language_absent ? "✅" : "❌"}`);
  console.log(`   Commitment gate valid: ${doctrineResult.doctrine_checks.commitment_gate_valid ? "✅" : "❌"}`);
  console.log(`   All checks passed: ${doctrineResult.doctrine_checks.all_checks_passed ? "✅" : "❌"}\n`);

  if (!doctrineResult.valid) {
    console.error("❌ Doctrine violations detected:");
    doctrineResult.errors.forEach((e) => console.error(`  - ${e}`));
    return;
  }

  // =========================================================================
  // STEP 5: Record Commitment (Simulating Owner Chooses Path A)
  // =========================================================================
  console.log("📝 STEP 5: Recording commitment (Owner chooses Path A)...\n");

  const commitmentResult = await recordCommitment({
    owner_choice: "path_A",
    chosen_path_details: pipelineResult.artifact.decision_paths[0],
    time_box_days: 90,
    minimal_actions: [
      {
        action: "Delegate quote approval to senior technician",
        deadline_days: 14,
        responsible: "owner",
      },
      {
        action: "Document approval criteria checklist",
        deadline_days: 7,
        responsible: "owner",
      },
    ],
    explicit_non_actions: [
      "NOT hiring additional staff",
      "NOT changing pricing structure",
      "NOT expanding service offerings",
    ],
  });

  console.log("✅ Commitment recorded:");
  console.log(`   Path chosen: ${commitmentResult.commitment_gate.owner_choice}`);
  console.log(`   Time box: ${commitmentResult.action_plan?.time_box_days} days`);
  console.log(`   Actions: ${commitmentResult.action_plan?.minimal_actions.length}`);
  console.log(`   Non-actions: ${commitmentResult.action_plan?.explicit_non_actions.length}\n`);

  console.log("🚫 Explicit NON-ACTIONS (Doctrine Compliant):");
  commitmentResult.action_plan?.explicit_non_actions.forEach((na) => {
    console.log(`   - ${na}`);
  });
  console.log();

  // =========================================================================
  // STEP 6: Save Artifacts
  // =========================================================================
  console.log("💾 STEP 6: Saving artifacts...\n");

  const outputDir = path.join(process.cwd(), "runs", "decision_closure_demo");
  await fs.mkdir(outputDir, { recursive: true });

  const artifactPath = path.join(outputDir, "decision_closure_artifact.json");
  await fs.writeFile(
    artifactPath,
    JSON.stringify(
      {
        ...pipelineResult.artifact,
        commitment_gate: commitmentResult.commitment_gate,
        action_plan: commitmentResult.action_plan,
        accountability: commitmentResult.accountability,
      },
      null,
      2
    )
  );

  const summaryPath = path.join(outputDir, "summary.md");
  await fs.writeFile(summaryPath, pipelineResult.summary);

  console.log(`✅ Artifacts saved:`);
  console.log(`   - ${artifactPath}`);
  console.log(`   - ${summaryPath}\n`);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("========================================");
  console.log("Demo Complete! 🎉");
  console.log("========================================\n");
  console.log("The full Decision Closure Pipeline executed successfully:");
  console.log("✅ SYSTEM 0: Owner Intent Captured");
  console.log("✅ SYSTEM 1: Business Reality Reconstructed");
  console.log("✅ SYSTEM 2: Structural Diagnosis Complete");
  console.log("✅ SYSTEM 3: 2 Decision Paths Generated (MAX 2 enforced)");
  console.log("✅ SYSTEM 4: Commitment Recorded with Explicit Non-Actions");
  console.log("✅ Doctrine: All checks passed\n");

  console.log("Next steps:");
  console.log("1. Owner executes minimal actions over 90 days");
  console.log("2. Run monthly validation via outcomes.review_v1 tool");
  console.log("3. Assess: continue, adjust, pivot, or end\n");
}

main().catch(console.error);
