import { spawnSync } from "node:child_process";
import fs from "node:fs";

type Args = {
  doKaggleIngest: boolean;
  slugs?: string;
  activateOnPass: boolean;
  minAccuracy: number;
  minGrounding: number;
  minJoint: number;
};

const DEFAULTS: Args = {
  doKaggleIngest: false,
  activateOnPass: true,
  minAccuracy: 0.78,
  minGrounding: 0.98,
  minJoint: 0.72,
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
      case "--slugs":
        args.slugs = value;
        break;
      case "--activate_on_pass":
        args.activateOnPass = value ? value !== "false" : true;
        break;
      case "--min_accuracy":
        args.minAccuracy = Number(value);
        break;
      case "--min_grounding":
        args.minGrounding = Number(value);
        break;
      case "--min_joint":
        args.minJoint = Number(value);
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

  console.log("STEP 1: scenario generation");
  if (args.doKaggleIngest) {
    const ingestArgs = ["run", "ml:kaggle:ingest"];
    if (args.slugs) {
      ingestArgs.push("--", "--datasets", args.slugs);
    }
    runCommand("npm", ingestArgs);
  }

  runCommand("npm", [
    "run",
    "ml:scenarios:generate",
    "--",
    "--hard_mode",
    "true",
    "--enable_fallback",
    "true",
    "--fallback_threshold",
    "0.35",
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

  console.log("STEP 2: scenario fine-tune");
  const finetuneResult = runCommandCapture("npm", ["run", "ml:finetune:scenario"]);
  const modelMatch = finetuneResult.stdout.match(/model:\s*(\S+)/i);
  const modelId = modelMatch?.[1];

  if (!modelId) {
    // Assume timeout, read job id from artifact
    try {
      const artifact = JSON.parse(fs.readFileSync("./ml_artifacts/latest_finetune_job.json", "utf8"));
      console.log(`Fine-tune submitted but still running. Job ID: ${artifact.job_id}`);
      console.log("Re-run this loop after fine-tune completes, or use ml:finetune:status and ml:finetune:resume.");
      process.exit(0);
    } catch {
      console.error("Fine-tune failed and no job artifact found.");
      process.exit(1);
    }
  }

  console.log("STEP 3: release gate");
  const gateResult = runCommandCapture("npm", [
    "run",
    "ml:release-gate",
    "--",
    "--min_accuracy",
    String(args.minAccuracy),
    "--min_grounding",
    String(args.minGrounding),
    "--min_joint",
    String(args.minJoint),
    "--activate",
    String(args.activateOnPass),
  ]);

  const gateMatch = gateResult.stdout.match(/GATE:\s*(PASS|FAIL)/i);
  const gateStatus = gateMatch?.[1]?.toUpperCase() ?? "UNKNOWN";
  const gatePathMatch = gateResult.stdout.match(/wrote\s+(\S+)/i);
  const gatePath = gatePathMatch?.[1] ?? "unknown";

  console.log(`MODEL: ${modelId}`);
  console.log(`GATE: ${gateStatus}`);
  console.log(`RELEASE REPORT: ${gatePath}`);
}

main();
