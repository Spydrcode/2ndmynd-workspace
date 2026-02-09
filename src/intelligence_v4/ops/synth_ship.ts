import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { EvalRunSummary } from "../evals/run_evals";
import { runEvals } from "../evals/run_evals";
import { runFtStage, type FtStageResult } from "../train/ft_stage_runner";
import { runPromotionGate, type PromotionResult } from "../train/promotion/regression_gate";
import { getFineTuneJobStatus } from "../train/openai_client";
import { buildDatasets, type BuildDatasetsResult } from "../train/datasets/build_datasets";
import { curateWeekly, type CurateWeeklyResult } from "../train/curation/curate_weekly";
import { parseSynthShipArgs, type SynthShipArgs } from "./ops_args";
import { createOpsLogger } from "./ops_logger";
import { type SynthShipManifest, writeOpsManifest } from "./ops_manifest";
import {
  resolveCandidatePromotionReportPath,
  resolveModelConfigPath,
  resolveOpsManifestPath,
  resolveReviewPackPath,
  resolveSynthesisDatasetPath,
  resolveSynthShipDir,
  toDateStamp,
  toFileStamp,
} from "./ops_paths";
import { evaluateTrainingDiversityFromDataset, type TrainingDiversityPolicy } from "./diversity_gate";
import { runRunpacksSynth, type RunpacksSynthResult } from "./runpacks_synth";

export type SynthShipDeps = {
  runpacks: (options: Parameters<typeof runRunpacksSynth>[0]) => Promise<RunpacksSynthResult>;
  curate: (options: Parameters<typeof curateWeekly>[0]) => Promise<CurateWeeklyResult>;
  datasets: (options: Parameters<typeof buildDatasets>[0]) => Promise<BuildDatasetsResult>;
  fineTune: (options: Parameters<typeof runFtStage>[0]) => Promise<FtStageResult>;
  evals: (options?: Parameters<typeof runEvals>[0]) => Promise<EvalRunSummary>;
  promote: (options: Parameters<typeof runPromotionGate>[0]) => Promise<PromotionResult>;
  pollFineTune: (job_id: string) => Promise<{ job_id: string; status: string; fine_tuned_model: string | null }>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
};

const defaultDeps: SynthShipDeps = {
  runpacks: runRunpacksSynth,
  curate: curateWeekly,
  datasets: buildDatasets,
  fineTune: runFtStage,
  evals: runEvals,
  promote: runPromotionGate,
  pollFineTune: getFineTuneJobStatus,
  now: () => new Date(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function hashFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

type DatasetRowLite = {
  approved?: boolean;
  industry?: string;
};

const DEFAULT_TRAINING_DIVERSITY_POLICY: TrainingDiversityPolicy = {
  min_total_rows: 40,
  min_industries: 4,
  max_industry_share: 0.6,
  max_duplicate_actions_share: 0.35,
  max_same_primary_constraint_prefix_share: 0.35,
};

function summarizeApprovedDataset(filePath: string): {
  approved_rows: number;
  top_industry: string | null;
  top_share: number;
} {
  if (!fs.existsSync(filePath)) {
    return { approved_rows: 0, top_industry: null, top_share: 0 };
  }

  const rows = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const industries = new Map<string, number>();
  let approvedRows = 0;

  for (const line of rows) {
    try {
      const row = JSON.parse(line) as DatasetRowLite;
      if (row.approved !== true) continue;
      approvedRows += 1;
      const industry = typeof row.industry === "string" && row.industry.trim().length > 0 ? row.industry.trim() : "unknown";
      industries.set(industry, (industries.get(industry) ?? 0) + 1);
    } catch {
      // Skip malformed lines.
    }
  }

  if (approvedRows === 0) {
    return { approved_rows: 0, top_industry: null, top_share: 0 };
  }

  const sorted = [...industries.entries()].sort((a, b) => b[1] - a[1]);
  const [topIndustry, topCount] = sorted[0];

  return {
    approved_rows: approvedRows,
    top_industry: topIndustry,
    top_share: topCount / approvedRows,
  };
}

function readTrainingDiversityPolicy(policyPath = path.resolve(process.cwd(), "config", "intelligence_v4.policy.json")): TrainingDiversityPolicy {
  if (!fs.existsSync(policyPath)) return DEFAULT_TRAINING_DIVERSITY_POLICY;
  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8")) as {
      training_diversity?: Partial<TrainingDiversityPolicy>;
    };
    const policy = parsed.training_diversity ?? {};
    return {
      min_total_rows: Math.max(1, Math.floor(policy.min_total_rows ?? DEFAULT_TRAINING_DIVERSITY_POLICY.min_total_rows)),
      min_industries: Math.max(1, Math.floor(policy.min_industries ?? DEFAULT_TRAINING_DIVERSITY_POLICY.min_industries)),
      max_industry_share: Math.min(1, Math.max(0, policy.max_industry_share ?? DEFAULT_TRAINING_DIVERSITY_POLICY.max_industry_share)),
      max_duplicate_actions_share: Math.min(
        1,
        Math.max(0, policy.max_duplicate_actions_share ?? DEFAULT_TRAINING_DIVERSITY_POLICY.max_duplicate_actions_share)
      ),
      max_same_primary_constraint_prefix_share: Math.min(
        1,
        Math.max(
          0,
          policy.max_same_primary_constraint_prefix_share ??
            DEFAULT_TRAINING_DIVERSITY_POLICY.max_same_primary_constraint_prefix_share
        )
      ),
    };
  } catch {
    return DEFAULT_TRAINING_DIVERSITY_POLICY;
  }
}

function readPinnedSynthesisModel(configPath = resolveModelConfigPath()): string | null {
  if (!fs.existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      stages?: { synthesis_decision?: { model_id?: string } };
    };
    return parsed.stages?.synthesis_decision?.model_id ?? null;
  } catch {
    return null;
  }
}

function writeCandidatePromotionReport(params: {
  ship_dir: string;
  reason: string;
  model_id: string | null;
  eval_report_path: string | null;
  dataset_path: string;
  dataset_hash: string | null;
}): string {
  const reportPath = resolveCandidatePromotionReportPath(params.ship_dir);
  const payload = {
    generated_at: new Date().toISOString(),
    type: "candidate_promotion",
    reason: params.reason,
    model_id: params.model_id,
    eval_report_path: params.eval_report_path,
    dataset_path: params.dataset_path,
    dataset_hash: params.dataset_hash,
    next_step:
      "If evals pass and a fine-tuned model ID exists, run npm run promote:model -- --stage=synthesis_decision --model=<MODEL_ID>",
  };
  fs.mkdirSync(params.ship_dir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  return reportPath;
}

async function maybePollFineTune(params: {
  dry_run: boolean;
  job_id: string | undefined;
  poll_job: boolean;
  poll_interval_seconds: number;
  poll_timeout_minutes: number;
  deps: SynthShipDeps;
}): Promise<{ status: string | null; fine_tuned_model: string | null }> {
  if (params.dry_run || !params.job_id) {
    return { status: null, fine_tuned_model: null };
  }

  if (!params.poll_job) {
    const status = await params.deps.pollFineTune(params.job_id);
    return {
      status: status.status,
      fine_tuned_model: status.fine_tuned_model,
    };
  }

  const timeoutAt = Date.now() + params.poll_timeout_minutes * 60 * 1000;
  let lastStatus: string | null = null;
  let fineTunedModel: string | null = null;

  while (Date.now() < timeoutAt) {
    const status = await params.deps.pollFineTune(params.job_id);
    lastStatus = status.status;
    fineTunedModel = status.fine_tuned_model;

    if (["succeeded", "failed", "cancelled"].includes(status.status)) {
      break;
    }

    await params.deps.sleep(params.poll_interval_seconds * 1000);
  }

  return {
    status: lastStatus,
    fine_tuned_model: fineTunedModel,
  };
}

export type SynthShipResult = {
  manifest_path: string;
  manifest: SynthShipManifest;
};

export async function runSynthShip(
  args: SynthShipArgs,
  deps: Partial<SynthShipDeps> = {}
): Promise<SynthShipResult> {
  const d: SynthShipDeps = { ...defaultDeps, ...deps };
  const logger = createOpsLogger();
  const shipStamp = toFileStamp(d.now());
  const shipDir = resolveSynthShipDir(shipStamp);
  const manifestPath = resolveOpsManifestPath(shipDir);
  fs.mkdirSync(shipDir, { recursive: true });

  const pinnedBefore = readPinnedSynthesisModel();

  const manifest: SynthShipManifest = {
    version: "synth_ship_v1",
    generated_at: d.now().toISOString(),
    status: "failed",
    args,
    run_ids_index_path: null,
    review_pack_path: null,
    dataset: {
      path: args.dataset_path || resolveSynthesisDatasetPath(),
      row_count: 0,
      sha256: null,
    },
    fine_tune: {
      attempted: false,
      dry_run: args.dry_run,
      run_dir: null,
      training_file_path: null,
      run_manifest_path: null,
      job_id: null,
    },
    evals: {
      attempted: false,
      passed: null,
      report_path: null,
      totals: null,
    },
    promotion: {
      attempted: false,
      promoted: false,
      report_path: null,
      model_card_path: null,
      old_model_id: pinnedBefore,
      new_model_id: null,
    },
    pinned_model: {
      before: pinnedBefore,
      after: pinnedBefore,
    },
    next_action: "",
    logs: [],
    errors: [],
  };

  try {
    if (!args.skip_runpacks) {
      logger.info("Step 1/7: generating candidate runs.");
      const runpacks = await d.runpacks({
        packs_dir: args.packs_dir,
        iterations: args.iterations,
        minimum_runs: args.target_runs,
        client_id: args.client_id,
        industry: args.industry,
        seed: args.seed,
        output_dir: shipDir,
        include_data_packs: true,
        industry_mix: args.industry_mix,
        min_industries: args.min_industries,
        ensure_diversity: args.ensure_diversity,
      });
      manifest.run_ids_index_path = runpacks.run_ids_path;
      logger.info(`Generated ${runpacks.succeeded_runs} candidate runs.`);
    } else {
      logger.warn("Step 1/7 skipped via --skip_runpacks=true.");
    }

    logger.info("Step 2/7: building review pack.");
    const reviewPackPath = resolveReviewPackPath(toDateStamp(d.now()));
    const review = await d.curate({
      workspace_id: args.client_id,
      days: args.days,
      out_file: reviewPackPath,
      stages: ["synthesis_decision"],
    });
    manifest.review_pack_path = review.out_file;

    logger.info("Step 3/7: building approved-only synthesis dataset.");
    const datasetSummary = await d.datasets({
      workspace_id: args.client_id,
      days: args.days,
      approved_only: args.approved_only,
      out_dir: path.dirname(args.dataset_path),
      stages: ["synthesis_decision"],
    });

    const datasetPath = args.dataset_path || resolveSynthesisDatasetPath();
    const synthesisRows = datasetSummary.rows.synthesis_decision ?? 0;
    manifest.dataset = {
      path: datasetPath,
      row_count: synthesisRows,
      sha256: hashFile(datasetPath),
    };

    if (synthesisRows === 0) {
      manifest.status = "awaiting_approval";
      manifest.next_action =
        "Approve items in the review pack, then re-run: npm run synth:ship -- --dry_run=true --days=90";
      logger.warn("No approved synthesis rows found. Approve review items, then re-run synth:ship.");
      manifest.logs = logger.entries;
      writeOpsManifest(manifestPath, manifest);
      return { manifest_path: manifestPath, manifest };
    }

    const diversityPolicy = readTrainingDiversityPolicy();
    const diversity = evaluateTrainingDiversityFromDataset(datasetPath, diversityPolicy);
    if (!diversity.passed) {
      const reasons = diversity.failures.join(" ");
      const details = `rows=${diversity.summary.approved_rows}, industries=${diversity.summary.unique_industries}, top_share=${(
        diversity.summary.top_industry_share * 100
      ).toFixed(1)}%`;
      manifest.status = "failed";
      manifest.next_action =
        "Fix dataset diversity, then re-run synth:ship. Suggested steps: npm run synth:packs && npm run synth:runpacks -- --iterations=10 && approve more underrepresented industries in the latest review pack.";
      throw new Error(`Diversity gate failed: ${reasons} (${details})`);
    }

    if (!args.dry_run) {
      const approved = summarizeApprovedDataset(datasetPath);
      if (approved.approved_rows < args.live_min_rows) {
        throw new Error(
          `Live fine-tune blocked: approved rows ${approved.approved_rows} below minimum ${args.live_min_rows}.`
        );
      }

      if (approved.top_share > args.max_homogeneity_share) {
        const pct = Math.round(approved.top_share * 100);
        const capPct = Math.round(args.max_homogeneity_share * 100);
        throw new Error(
          `Live fine-tune blocked: approved set is ${pct}% ${approved.top_industry ?? "unknown"} (max ${capPct}%).`
        );
      }
    }

    logger.info("Step 4/7: preparing synthesis fine-tune data.");
    manifest.fine_tune.attempted = true;
    const ftResult = await d.fineTune({
      stage: "synthesis_decision",
      dataset_path: datasetPath,
      base_model: args.base_model,
      suffix: args.suffix,
      dry_run: args.dry_run,
      approved_only: args.approved_only,
      min_rows: args.min_rows,
      notes: args.notes,
    });
    manifest.fine_tune.run_dir = ftResult.run_dir;
    manifest.fine_tune.training_file_path = ftResult.training_file_path;
    manifest.fine_tune.run_manifest_path = ftResult.manifest_path;
    manifest.fine_tune.job_id = ftResult.job_id ?? null;

    const polled = await maybePollFineTune({
      dry_run: args.dry_run,
      job_id: ftResult.job_id,
      poll_job: args.poll_job,
      poll_interval_seconds: args.poll_interval_seconds,
      poll_timeout_minutes: args.poll_timeout_minutes,
      deps: d,
    });

    logger.info("Step 5/7: running eval suite.");
    manifest.evals.attempted = true;
    const evals = await d.evals({ mode: "pipeline" });
    manifest.evals.passed = evals.totals.failed === 0;
    manifest.evals.report_path = evals.report_path ?? null;
    manifest.evals.totals = evals.totals;

    logger.info("Step 6/7: promotion decision.");
    const proposedModelId = polled.fine_tuned_model ?? `candidate:${args.suffix}`;
    manifest.promotion.new_model_id = proposedModelId;

    if (!manifest.evals.passed) {
      manifest.promotion.report_path = writeCandidatePromotionReport({
        ship_dir: shipDir,
        reason: "Eval gate failed",
        model_id: proposedModelId,
        eval_report_path: manifest.evals.report_path,
        dataset_path: manifest.dataset.path,
        dataset_hash: manifest.dataset.sha256,
      });
      manifest.status = "candidate_ready";
      manifest.next_action = "Fix eval failures, then re-run synth:ship.";
    } else if (args.dry_run) {
      manifest.promotion.attempted = true;
      const dryPromotion = await d.promote({
        stage: "synthesis_decision",
        model: proposedModelId,
        dataset_path: manifest.dataset.path,
        dry_run: true,
        notes: args.notes,
        force: true,
        approved_only: args.approved_only,
        base_model: args.base_model,
        current_path: resolveModelConfigPath(),
      });
      manifest.promotion.report_path = dryPromotion.report_path;
      manifest.promotion.model_card_path = dryPromotion.model_card_path;
      manifest.status = "candidate_ready";
      manifest.next_action =
        "Review the model card and promotion report. Then run live fine-tune: npm run synth:ship -- --dry_run=false --auto_promote=true";
    } else if (args.auto_promote && polled.fine_tuned_model) {
      manifest.promotion.attempted = true;
      const promoted = await d.promote({
        stage: "synthesis_decision",
        model: polled.fine_tuned_model,
        dataset_path: manifest.dataset.path,
        dry_run: false,
        notes: args.notes,
        force: args.force,
        approved_only: args.approved_only,
        base_model: args.base_model,
        current_path: resolveModelConfigPath(),
      });
      manifest.promotion.promoted = promoted.config_updated;
      manifest.promotion.report_path = promoted.report_path;
      manifest.promotion.model_card_path = promoted.model_card_path;
      manifest.status = "completed";
      manifest.next_action = "Promotion applied. Continue with monitoring via weekly eval runs.";
    } else {
      const reason = args.auto_promote
        ? "Auto-promote requested but fine-tuned model ID is not yet available."
        : "Auto-promote disabled.";
      manifest.promotion.report_path = writeCandidatePromotionReport({
        ship_dir: shipDir,
        reason,
        model_id: proposedModelId,
        eval_report_path: manifest.evals.report_path,
        dataset_path: manifest.dataset.path,
        dataset_hash: manifest.dataset.sha256,
      });
      manifest.status = "candidate_ready";
      manifest.next_action =
        "When fine-tuned model ID is ready, run: npm run promote:model -- --stage=synthesis_decision --model=<MODEL_ID>";
    }

    manifest.pinned_model.after = readPinnedSynthesisModel();

    logger.info("Step 7/7: writing ops manifest.");
    manifest.logs = logger.entries;
    writeOpsManifest(manifestPath, manifest);

    return {
      manifest_path: manifestPath,
      manifest,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    manifest.errors.push(message);
    manifest.status = "failed";
    if (!manifest.next_action || manifest.next_action.trim().length === 0) {
      manifest.next_action = "Inspect ops_manifest.json and fix the failing step before re-running synth:ship.";
    }
    manifest.pinned_model.after = readPinnedSynthesisModel();
    manifest.logs = logger.entries;
    writeOpsManifest(manifestPath, manifest);
    throw error;
  }
}

async function main() {
  const args = parseSynthShipArgs(process.argv.slice(2));
  const result = await runSynthShip(args);
  console.log(JSON.stringify({ manifest_path: result.manifest_path, status: result.manifest.status }, null, 2));
  console.log(`Next: ${result.manifest.next_action}`);
}

if (process.argv[1]?.includes("synth_ship.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
