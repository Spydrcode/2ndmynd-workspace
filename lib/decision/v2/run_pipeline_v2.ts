import fs from "node:fs";
import path from "node:path";

import { scrubPII, assertNoPII } from "./pii_scrub";
import {
  buildSnapshotV2,
  BuildSnapshotV2Input,
  RawInvoice,
  RawQuote,
} from "./snapshot/build_snapshot_v2";
import { inferDecisionV2 } from "./decision_infer_v2";
import {
  SnapshotV2,
  ConclusionV2,
  validateConclusionV2,
  validateEvidenceSignalsAgainstSnapshotV2,
} from "./conclusion_schema_v2";
import { createRunContext, finalizeRunContext } from "./run_context";

export type PipelineInput = {
  source: string;
  quotes: RawQuote[];
  invoices: RawInvoice[];
  input_costs?: BuildSnapshotV2Input["input_costs"];
  report_date?: string;
  lookback_days?: number;
  tags?: string[];
};

export type PipelineV2Result = {
  snapshot: SnapshotV2;
  conclusion: ConclusionV2;
  meta: {
    run_id: string;
    input_hash: string;
    model_id: string;
    source: string;
    tags: string[];
    primary_ok: boolean;
    rewrite_used: boolean;
    fallback_used: boolean;
    decision_patch_applied: boolean;
    decision_patch_reason: "verb" | "timebox" | "both" | null;
  };
  artifacts: {
    micro_rewrite_attempted: boolean;
    micro_rewrite_applied: boolean;
    micro_rewrite_failed: boolean;
    micro_rewrite_reason: "decision_verb" | "decision_timebox" | "both" | null;
    micro_rewrite_triggered: boolean;
    micro_rewrite_changed_text: boolean;
    micro_rewrite_raw_json?: string;
    decision_before?: string;
    decision_after?: string;
    decision_after_checks?: { decision_verb_ok: boolean; decision_timebox_ok: boolean };
  };
  validator_failures: string[];
  pii_findings: string[];
  season_warnings: string[];
  log_path?: string;
};

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

export async function runPipelineV2(
  input: PipelineInput,
  options?: { patch_queue_path?: string; write_log?: boolean; log_path?: string }
): Promise<PipelineV2Result> {
  const scrubbed = scrubPII(input);
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
    patch_queue_path: options?.patch_queue_path ?? "ml_artifacts/patch_queue.jsonl",
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

  const validatorFailures = [
    ...(schema.ok ? [] : schema.errors),
    ...(grounding.ok ? [] : grounding.errors),
    ...(infer.forbidden_terms.length ? [`forbidden: ${infer.forbidden_terms.join(", ")}`] : []),
  ];

  const runRecord = finalizeRunContext({
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
    validator_failures: validatorFailures,
  });

  const logPath = options?.log_path ?? path.join("ml_artifacts", "pipeline_v2_runs.jsonl");
  if (options?.write_log) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(
      logPath,
      JSON.stringify({
        ...runRecord,
        pii_findings: scrubbed.findings,
        snapshot,
        conclusion: infer.conclusion,
        season_warnings: infer.season_warnings,
      }) + "\n"
    );
  }

  return {
    snapshot,
    conclusion: infer.conclusion,
    meta: {
      run_id: runRecord.run_id,
      input_hash: runRecord.input_hash,
      model_id: infer.model_id,
      source: normalized.source,
      tags: normalized.tags ?? [],
      primary_ok: infer.primary_ok,
      rewrite_used: infer.rewrite_used,
      fallback_used: infer.fallback_used,
      decision_patch_applied: infer.decision_patch_applied,
      decision_patch_reason: infer.decision_patch_reason,
    },
    artifacts: {
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
    },
    validator_failures: validatorFailures,
    pii_findings: scrubbed.findings,
    season_warnings: infer.season_warnings,
    log_path: options?.write_log ? logPath : undefined,
  };
}
