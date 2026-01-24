import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { redact } from "./redact";

type Args = {
  doKaggleIngest: boolean;
  onlyPatterns: string[];
  nPerPattern: number;
  maxTotalPacks: number;
  suffix: string;
  maxWaitMinutes: number;
};

const DEFAULTS: Args = {
  doKaggleIngest: false,
  onlyPatterns: ["scheduling_window_pressure", "quote_followup_drag", "cash_timing_stretch", "scope_instability_midjob"],
  nPerPattern: 25,
  maxTotalPacks: 220,
  suffix: "2ndmynd-scenario-canary-v2",
  maxWaitMinutes: 240,
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (value === undefined) continue;

    switch (key) {
      case "--do_kaggle_ingest":
        args.doKaggleIngest = value ? value !== "false" : true;
        break;
      case "--only_patterns":
        if (value) args.onlyPatterns = value.split(",").map((item) => item.trim());
        break;
      case "--n_per_pattern":
        if (value) args.nPerPattern = Number(value);
        break;
      case "--max_total_packs":
        if (value) args.maxTotalPacks = Number(value);
        break;
      case "--suffix":
        if (value) args.suffix = value;
        break;
      case "--max_wait_minutes":
        if (value) args.maxWaitMinutes = Number(value);
        break;
      default:
        break;
    }
  }
  return args;
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function runCommandCapture(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("STEP 1: canary scenario generation");
  if (args.doKaggleIngest) {
    runCommand("npm", ["run", "ml:kaggle:ingest"]);
  }

  runCommand("npm", [
    "run",
    "ml:scenarios:generate",
    "--",
    "--n_per_pattern",
    String(args.nPerPattern),
    "--include_negatives",
    "true",
    "--hard_mode",
    "true",
    "--enable_fallback",
    "true",
    "--fallback_threshold",
    "0.35",
    "--only_patterns",
    args.onlyPatterns.join(","),
    "--max_total_packs",
    String(args.maxTotalPacks),
  ]);
  runCommand("npm", ["run", "ml:scenarios:coverage"]);
  runCommand("npm", ["run", "ml:scenarios:import"]);
  runCommand("npm", [
    "run",
    "ml:export-jsonl",
    "--",
    "--dataset",
    "scenario_train_v1",
    "--out",
    "./ml_artifacts/scenario_train_v1.jsonl",
  ]);

  console.log("STEP 2: canary fine-tune");
  const finetuneResult = runCommandCapture("npm", [
    "run",
    "ml:finetune:scenario",
    "--",
    "--suffix",
    args.suffix,
    "--epochs",
    "2",
    "--lr_multiplier",
    "1.0",
    "--batch_size",
    "1",
    "--max_wait_minutes",
    String(args.maxWaitMinutes),
  ]);

  const modelMatch = finetuneResult.stdout.match(/model:\s*(\S+)/i);
  const modelId = modelMatch?.[1];

  if (modelId) {
    console.log("Canary fine-tune succeeded!");
  } else {
    console.log("Canary fine-tune timed out or failed.");
    // Try to read job id
    try {
      const artifact = JSON.parse(fs.readFileSync("./ml_artifacts/latest_finetune_job.json", "utf8"));
      console.log(`Job ID: ${redact(artifact.job_id)}`);
      console.log("Next steps:");
      console.log("npm run ml:finetune:status");
      console.log("npm run ml:finetune:events");
      console.log(`npm run ml:finetune:resume -- --job_id ${redact(artifact.job_id)}`);
    } catch {
      console.error("No job artifact found.");
    }
  }
}

main();
