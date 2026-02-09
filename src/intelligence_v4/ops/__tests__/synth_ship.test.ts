import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SynthShipArgs } from "../ops_args";
import { runSynthShip } from "../synth_ship";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function seedConfig(root: string) {
  writeJson(path.resolve(root, "config", "intelligence_v4.models.json"), {
    version: "intelligence_v4.models/1",
    stages: {
      quant_signals: { model_id: "deterministic:quant-v1" },
      emyth_owner_load: { model_id: "deterministic:emyth-v1" },
      competitive_lens: { model_id: "deterministic:competitive-v1" },
      blue_ocean: { model_id: "deterministic:blue-v1" },
      synthesis_decision: {
        model_id: "deterministic:synthesis-v1",
        rollout: { strategy: "pinned", canary_percent: 0 },
        promotion_history: [],
      },
    },
  });
  writeJson(path.resolve(root, "config", "intelligence_v4.policy.json"), {
    training_diversity: {
      min_total_rows: 1,
      min_industries: 1,
      max_industry_share: 1,
      max_duplicate_actions_share: 1,
      max_same_primary_constraint_prefix_share: 1,
    },
  });
}

function baseArgs(root: string): SynthShipArgs {
  return {
    dry_run: true,
    days: 90,
    base_model: "gpt-4o-mini-2024-07-18",
    suffix: "2ndmynd-synth-test",
    auto_promote: false,
    approved_only: true,
    skip_runpacks: false,
    packs_dir: path.resolve(root, "src", "intelligence_v4", "evals", "fixtures"),
    iterations: 10,
    target_runs: 50,
    client_id: "test-client-synth",
    dataset_path: path.resolve(root, "train", "datasets", "stage_synthesis.jsonl"),
    min_rows: 1,
    force: true,
    poll_job: false,
    poll_interval_seconds: 10,
    poll_timeout_minutes: 10,
    live_min_rows: 40,
    max_homogeneity_share: 0.8,
    industry_mix: "balanced",
    min_industries: 6,
    ensure_diversity: true,
  };
}

describe("synth_ship", () => {
  it("executes steps in expected order on dry-run happy path", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "synth-ship-order-"));
    process.chdir(tempRoot);
    seedConfig(tempRoot);

    const order: string[] = [];

    const result = await runSynthShip(baseArgs(tempRoot), {
      runpacks: async (options) => {
        order.push("runpacks");
        writeJson(path.resolve(options?.output_dir ?? tempRoot, "run_ids.json"), { run_ids: ["r1"] });
        return {
          output_dir: options?.output_dir ?? tempRoot,
          run_ids_path: path.resolve(options?.output_dir ?? tempRoot, "run_ids.json"),
          run_ids: ["r1"],
          failed_runs: [],
          templates_used: 3,
          iterations: 17,
          attempted_runs: 51,
          succeeded_runs: 51,
        };
      },
      curate: async () => {
        order.push("curate");
        const out = path.resolve(tempRoot, "train", "curation", "review_packs", "review_pack_2026-02-09.json");
        writeJson(out, { items: [] });
        return { workspace_id: "test-client-synth", runs_scanned: 1, items_written: 0, out_file: out };
      },
      datasets: async () => {
        order.push("datasets");
        fs.mkdirSync(path.resolve(tempRoot, "train", "datasets"), { recursive: true });
        fs.writeFileSync(path.resolve(tempRoot, "train", "datasets", "stage_synthesis.jsonl"), '{"approved":true}\n');
        return {
          workspace_id: "test-client-synth",
          approved_only: true,
          window_days: 90,
          rows: {
            quant_signals: 0,
            emyth_owner_load: 0,
            competitive_lens: 0,
            blue_ocean: 0,
            synthesis_decision: 1,
          },
          out_dir: path.resolve(tempRoot, "train", "datasets"),
        };
      },
      fineTune: async () => {
        order.push("fineTune");
        const runDir = path.resolve(tempRoot, "train", "finetune_runs", "synthesis_decision", "20260209T000000Z");
        fs.mkdirSync(runDir, { recursive: true });
        const manifestPath = path.resolve(runDir, "run_manifest.json");
        const trainPath = path.resolve(runDir, "train_openai.jsonl");
        fs.writeFileSync(manifestPath, "{}");
        fs.writeFileSync(trainPath, "{}\n");
        return {
          stage: "synthesis_decision",
          dataset_path: path.resolve(tempRoot, "train", "datasets", "stage_synthesis.jsonl"),
          run_dir: runDir,
          manifest_path: manifestPath,
          training_file_path: trainPath,
          total_rows: 1,
          accepted_rows: 1,
          rejected_rows: 0,
          dry_run: true,
        };
      },
      evals: async () => {
        order.push("evals");
        return {
          generated_at: new Date().toISOString(),
          mode: "pipeline",
          report_path: path.resolve(tempRoot, "evals", "report_20260209T000000Z.json"),
          totals: { fixtures: 3, passed: 3, failed: 0 },
          results: [],
        };
      },
      promote: async () => {
        order.push("promote");
        return {
          stage: "synthesis_decision",
          old_model_id: "deterministic:synthesis-v1",
          new_model_id: "candidate:2ndmynd-synth-test",
          dry_run: true,
          passed: true,
          report_path: path.resolve(tempRoot, "train", "promotion", "reports", "synthesis_decision", "promotion_1.json"),
          eval_report_paths: [],
          model_card_path: path.resolve(tempRoot, "train", "model_cards", "synthesis_decision", "candidate.md"),
          config_updated: false,
        };
      },
      pollFineTune: async () => ({ job_id: "", status: "succeeded", fine_tuned_model: null }),
    });

    expect(order).toEqual(["runpacks", "curate", "datasets", "fineTune", "evals", "promote"]);
    expect(result.manifest.status).toBe("candidate_ready");
    expect(fs.existsSync(result.manifest_path)).toBe(true);
  });

  it("stops early with instruction when dataset has zero approved rows", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "synth-ship-zero-"));
    process.chdir(tempRoot);
    seedConfig(tempRoot);

    const called: string[] = [];

    const result = await runSynthShip(baseArgs(tempRoot), {
      runpacks: async () => {
        called.push("runpacks");
        return {
          output_dir: tempRoot,
          run_ids_path: path.resolve(tempRoot, "run_ids.json"),
          run_ids: [],
          failed_runs: [],
          templates_used: 1,
          iterations: 1,
          attempted_runs: 0,
          succeeded_runs: 0,
        };
      },
      curate: async () => {
        called.push("curate");
        return {
          workspace_id: "test-client-synth",
          runs_scanned: 0,
          items_written: 0,
          out_file: path.resolve(tempRoot, "review_pack.json"),
        };
      },
      datasets: async () => {
        called.push("datasets");
        return {
          workspace_id: "test-client-synth",
          approved_only: true,
          window_days: 90,
          rows: {
            quant_signals: 0,
            emyth_owner_load: 0,
            competitive_lens: 0,
            blue_ocean: 0,
            synthesis_decision: 0,
          },
          out_dir: path.resolve(tempRoot, "train", "datasets"),
        };
      },
      fineTune: async () => {
        called.push("fineTune");
        throw new Error("should not run");
      },
      evals: async () => {
        called.push("evals");
        throw new Error("should not run");
      },
      promote: async () => {
        called.push("promote");
        throw new Error("should not run");
      },
      pollFineTune: async () => ({ job_id: "", status: "succeeded", fine_tuned_model: null }),
    });

    expect(called).toEqual(["runpacks", "curate", "datasets"]);
    expect(result.manifest.status).toBe("awaiting_approval");
    expect(result.manifest.next_action.toLowerCase()).toContain("approve");
  });

  it("writes ops manifest and does not modify config in dry-run", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "synth-ship-config-"));
    process.chdir(tempRoot);
    seedConfig(tempRoot);

    const configPath = path.resolve(tempRoot, "config", "intelligence_v4.models.json");
    const before = fs.readFileSync(configPath, "utf8");

    const result = await runSynthShip(baseArgs(tempRoot), {
      runpacks: async () => ({
        output_dir: tempRoot,
        run_ids_path: path.resolve(tempRoot, "run_ids.json"),
        run_ids: ["r1"],
        failed_runs: [],
        templates_used: 1,
        iterations: 1,
        attempted_runs: 1,
        succeeded_runs: 1,
      }),
      curate: async () => ({
        workspace_id: "test-client-synth",
        runs_scanned: 1,
        items_written: 1,
        out_file: path.resolve(tempRoot, "review_pack.json"),
      }),
      datasets: async () => {
        const dataset = path.resolve(tempRoot, "train", "datasets", "stage_synthesis.jsonl");
        fs.mkdirSync(path.dirname(dataset), { recursive: true });
        fs.writeFileSync(dataset, '{"approved":true}\n');
        return {
          workspace_id: "test-client-synth",
          approved_only: true,
          window_days: 90,
          rows: {
            quant_signals: 0,
            emyth_owner_load: 0,
            competitive_lens: 0,
            blue_ocean: 0,
            synthesis_decision: 1,
          },
          out_dir: path.dirname(dataset),
        };
      },
      fineTune: async () => {
        const runDir = path.resolve(tempRoot, "train", "finetune_runs", "synthesis_decision", "run1");
        fs.mkdirSync(runDir, { recursive: true });
        return {
          stage: "synthesis_decision",
          dataset_path: path.resolve(tempRoot, "train", "datasets", "stage_synthesis.jsonl"),
          run_dir: runDir,
          manifest_path: path.resolve(runDir, "run_manifest.json"),
          training_file_path: path.resolve(runDir, "train_openai.jsonl"),
          total_rows: 1,
          accepted_rows: 1,
          rejected_rows: 0,
          dry_run: true,
        };
      },
      evals: async () => ({
        generated_at: new Date().toISOString(),
        mode: "pipeline",
        report_path: path.resolve(tempRoot, "evals", "report.json"),
        totals: { fixtures: 3, passed: 3, failed: 0 },
        results: [],
      }),
      promote: async () => ({
        stage: "synthesis_decision",
        old_model_id: "deterministic:synthesis-v1",
        new_model_id: "candidate:test",
        dry_run: true,
        passed: true,
        report_path: path.resolve(tempRoot, "report.json"),
        eval_report_paths: [],
        model_card_path: path.resolve(tempRoot, "card.md"),
        config_updated: false,
      }),
      pollFineTune: async () => ({ job_id: "", status: "succeeded", fine_tuned_model: null }),
    });

    const after = fs.readFileSync(configPath, "utf8");
    expect(before).toBe(after);

    const manifest = JSON.parse(fs.readFileSync(result.manifest_path, "utf8")) as {
      dataset: { row_count: number };
      run_ids_index_path: string | null;
      review_pack_path: string | null;
      fine_tune: { attempted: boolean };
    };

    expect(manifest.run_ids_index_path).not.toBeNull();
    expect(manifest.review_pack_path).not.toBeNull();
    expect(manifest.dataset.row_count).toBe(1);
    expect(manifest.fine_tune.attempted).toBe(true);
  });

  it("fails live run when approved rows are below threshold", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "synth-ship-live-minrows-"));
    process.chdir(tempRoot);
    seedConfig(tempRoot);

    const args = {
      ...baseArgs(tempRoot),
      dry_run: false,
      live_min_rows: 40,
    };

    await expect(
      runSynthShip(args, {
        runpacks: async () => ({
          output_dir: tempRoot,
          run_ids_path: path.resolve(tempRoot, "run_ids.json"),
          run_ids: ["r1"],
          failed_runs: [],
          templates_used: 1,
          iterations: 1,
          attempted_runs: 1,
          succeeded_runs: 1,
        }),
        curate: async () => ({
          workspace_id: "test-client-synth",
          runs_scanned: 1,
          items_written: 1,
          out_file: path.resolve(tempRoot, "review_pack.json"),
        }),
        datasets: async () => {
          const dataset = path.resolve(tempRoot, "train", "datasets", "stage_synthesis.jsonl");
          fs.mkdirSync(path.dirname(dataset), { recursive: true });
          fs.writeFileSync(
            dataset,
            `${JSON.stringify({ approved: true, industry: "hvac" })}\n${JSON.stringify({
              approved: true,
              industry: "plumbing",
            })}\n`
          );
          return {
            workspace_id: "test-client-synth",
            approved_only: true,
            window_days: 90,
            rows: {
              quant_signals: 0,
              emyth_owner_load: 0,
              competitive_lens: 0,
              blue_ocean: 0,
              synthesis_decision: 2,
            },
            out_dir: path.dirname(dataset),
          };
        },
        fineTune: async () => {
          throw new Error("should not run");
        },
        evals: async () => {
          throw new Error("should not run");
        },
        promote: async () => {
          throw new Error("should not run");
        },
        pollFineTune: async () => ({ job_id: "", status: "succeeded", fine_tuned_model: null }),
      })
    ).rejects.toThrow(/approved rows/i);
  });

  it("fails live run when approved set is overly homogeneous", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "synth-ship-live-homogeneous-"));
    process.chdir(tempRoot);
    seedConfig(tempRoot);

    const args = {
      ...baseArgs(tempRoot),
      dry_run: false,
      live_min_rows: 5,
      max_homogeneity_share: 0.8,
    };

    const rows = Array.from({ length: 10 }, (_, index) =>
      JSON.stringify({
        approved: true,
        industry: index < 9 ? "plumbing" : "hvac",
      })
    ).join("\n");

    await expect(
      runSynthShip(args, {
        runpacks: async () => ({
          output_dir: tempRoot,
          run_ids_path: path.resolve(tempRoot, "run_ids.json"),
          run_ids: ["r1"],
          failed_runs: [],
          templates_used: 1,
          iterations: 1,
          attempted_runs: 1,
          succeeded_runs: 1,
        }),
        curate: async () => ({
          workspace_id: "test-client-synth",
          runs_scanned: 1,
          items_written: 1,
          out_file: path.resolve(tempRoot, "review_pack.json"),
        }),
        datasets: async () => {
          const dataset = path.resolve(tempRoot, "train", "datasets", "stage_synthesis.jsonl");
          fs.mkdirSync(path.dirname(dataset), { recursive: true });
          fs.writeFileSync(dataset, `${rows}\n`);
          return {
            workspace_id: "test-client-synth",
            approved_only: true,
            window_days: 90,
            rows: {
              quant_signals: 0,
              emyth_owner_load: 0,
              competitive_lens: 0,
              blue_ocean: 0,
              synthesis_decision: 10,
            },
            out_dir: path.dirname(dataset),
          };
        },
        fineTune: async () => {
          throw new Error("should not run");
        },
        evals: async () => {
          throw new Error("should not run");
        },
        promote: async () => {
          throw new Error("should not run");
        },
        pollFineTune: async () => ({ job_id: "", status: "succeeded", fine_tuned_model: null }),
      })
    ).rejects.toThrow(/overly homogeneous|blocked/i);
  });
});
