import fs from "node:fs";
import path from "node:path";

import { runPipelineV2, PipelineInput } from "../../../lib/decision/v2/run_pipeline_v2";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawInput = loadInput(args);

  const normalized = rawInput as PipelineInput;
  const result = await runPipelineV2(normalized, {
    patch_queue_path: process.env.PATCH_QUEUE_PATH ?? "ml_artifacts/patch_queue.jsonl",
    write_log: true,
    log_path: path.join("ml_artifacts", "pipeline_v2_runs.jsonl"),
  });

  console.log(
    JSON.stringify(
      {
        run_id: result.meta.run_id,
        model_id: result.meta.model_id,
        snapshot_version: result.snapshot.snapshot_version,
        conclusion: result.conclusion,
        primary_ok: result.meta.primary_ok,
        rewrite_used: result.meta.rewrite_used,
        fallback_used: result.meta.fallback_used,
        micro_rewrite_attempted: result.artifacts.micro_rewrite_attempted,
        micro_rewrite_applied: result.artifacts.micro_rewrite_applied,
        micro_rewrite_failed: result.artifacts.micro_rewrite_failed,
        micro_rewrite_reason: result.artifacts.micro_rewrite_reason,
        decision_before: result.artifacts.decision_before,
        decision_after: result.artifacts.decision_after,
        validator_failures: result.validator_failures,
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
