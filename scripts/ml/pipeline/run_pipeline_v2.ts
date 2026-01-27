import fs from "node:fs";
import path from "node:path";

import { scrubPII, assertNoPII } from "../lib/pii_scrub";
import { buildSnapshotV2, BuildSnapshotV2Input, RawInvoice, RawQuote } from "../lib/snapshot/build_snapshot_v2";
import { inferDecisionV2 } from "../lib/decision_infer_v2";
import { validateConclusionV2, validateEvidenceSignalsAgainstSnapshotV2 } from "../lib/conclusion_schema_v2";
import { createRunContext, finalizeRunContext } from "../lib/run_context";

type PipelineInput = {
  source: string;
  quotes: RawQuote[];
  invoices: RawInvoice[];
  input_costs?: BuildSnapshotV2Input["input_costs"];
  report_date?: string;
  lookback_days?: number;
  tags?: string[];
};

function parseArgs(argv: string[]) {
  const args: { inputPath?: string; json?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--in":
        args.inputPath = value;
        break;
      case "--json":
        args.json = value;
        break;
      default:
        break;
    }
  }
  return args;
}

function loadInput(args: { inputPath?: string; json?: string }): PipelineInput {
  let raw = args.json ?? "";
  if (args.inputPath) {
    const inputPath = path.resolve(args.inputPath);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Missing input file: ${inputPath}`);
    }
    raw = fs.readFileSync(inputPath, "utf8");
  }
  if (!raw) {
    throw new Error("Provide --in <path> or --json '<payload>'.");
  }
  return JSON.parse(raw) as PipelineInput;
}

function normalizeInput(input: PipelineInput): PipelineInput {
  return {
    source: input.source,
    quotes: (input.quotes ?? []).map((q) => ({
      created_at: q.created_at,
      approved_at: q.approved_at,
      status: q.status,
      total: q.total,
    })),
    invoices: (input.invoices ?? []).map((inv) => ({
      issued_at: inv.issued_at,
      paid_at: inv.paid_at,
      status: inv.status,
      total: inv.total,
    })),
    input_costs: (input.input_costs ?? []).map((c) => ({
      name: c.name,
      unit: c.unit,
      current: c.current,
      change_30d_pct: c.change_30d_pct,
      change_90d_pct: c.change_90d_pct,
      volatility_band: c.volatility_band,
    })),
    report_date: input.report_date,
    lookback_days: input.lookback_days,
    tags: input.tags ?? [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawInput = loadInput(args);

  const scrubbed = scrubPII(rawInput);
  assertNoPII(scrubbed.scrubbed);

  const normalized = normalizeInput(scrubbed.scrubbed as PipelineInput);

  const snapshot = buildSnapshotV2({
    quotes: normalized.quotes,
    invoices: normalized.invoices,
    input_costs: normalized.input_costs,
    report_date: normalized.report_date,
    lookback_days: normalized.lookback_days,
  });

  const infer = await inferDecisionV2(snapshot, {
    patch_queue_path: process.env.PATCH_QUEUE_PATH ?? "ml_artifacts/patch_queue.jsonl",
  });
  const schema = validateConclusionV2(infer.conclusion);
  const grounding = validateEvidenceSignalsAgainstSnapshotV2(snapshot, infer.conclusion.evidence_signals);

  const runContext = createRunContext({
    input: normalized,
    snapshot_version: snapshot.snapshot_version,
    model_id: infer.model_id,
    source: normalized.source,
    tags: normalized.tags,
  });

  const runRecord = {
    ...runContext,
    primary_ok: infer.primary_ok,
    rewrite_used: infer.rewrite_used,
    fallback_used: infer.fallback_used,
    micro_rewrite_attempted: infer.micro_rewrite_attempted,
    micro_rewrite_applied: infer.micro_rewrite_applied,
    micro_rewrite_failed: infer.micro_rewrite_failed,
    micro_rewrite_reason: infer.micro_rewrite_reason,
    micro_rewrite_triggered: infer.micro_rewrite_triggered,
    micro_rewrite_changed_text: infer.micro_rewrite_changed_text,
    micro_rewrite_raw_json: infer.micro_rewrite_raw_json,
    decision_before: infer.decision_before,
    decision_after: infer.decision_after,
    decision_after_checks: infer.decision_after_checks,
    validator_failures: [
      ...(schema.ok ? [] : schema.errors),
      ...(grounding.ok ? [] : grounding.errors),
      ...(infer.forbidden_terms.length ? [`forbidden: ${infer.forbidden_terms.join(", ")}`] : []),
    ],
  };
  const record = finalizeRunContext(runRecord);

  const outDir = "ml_artifacts";
  fs.mkdirSync(outDir, { recursive: true });
  fs.appendFileSync(
    path.join(outDir, "pipeline_v2_runs.jsonl"),
    JSON.stringify({
      ...record,
      pii_findings: scrubbed.findings,
      snapshot,
      conclusion: infer.conclusion,
      season_warnings: infer.season_warnings,
    }) + "\n"
  );

  console.log(
    JSON.stringify(
      {
        run_id: record.run_id,
        model_id: infer.model_id,
        snapshot_version: snapshot.snapshot_version,
        conclusion: infer.conclusion,
        primary_ok: infer.primary_ok,
        rewrite_used: infer.rewrite_used,
        fallback_used: infer.fallback_used,
        micro_rewrite_attempted: infer.micro_rewrite_attempted,
        micro_rewrite_applied: infer.micro_rewrite_applied,
        micro_rewrite_failed: infer.micro_rewrite_failed,
        micro_rewrite_reason: infer.micro_rewrite_reason,
        decision_before: infer.decision_before,
        decision_after: infer.decision_after,
        validator_failures: runRecord.validator_failures,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Pipeline failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
