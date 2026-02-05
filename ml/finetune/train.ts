import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import minimist from "minimist";
import OpenAI from "openai";
import { addHistoryEntry } from "../registry/registry";

function getGitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

function sha256File(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getStringArg(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function run() {
  const args = minimist(process.argv.slice(2));
  const trainPath = getStringArg(args.train, path.join(process.cwd(), "ml", "finetune", "train.jsonl"));
  const baseModel = getStringArg(args.base_model, process.env.OPENAI_BASE_MODEL ?? "gpt-4o-mini-2024-07-18");
  const suffix = getStringArg(args.suffix, `cis-${new Date().toISOString().slice(0, 10)}-${getGitSha()}`);

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to start a fine-tune job.");
  }
  if (!fs.existsSync(trainPath)) {
    throw new Error(`Training file not found: ${trainPath}`);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const file = await client.files.create({
    file: fs.createReadStream(trainPath),
    purpose: "fine-tune",
  });

  const job = await client.fineTuning.jobs.create({
    model: baseModel,
    training_file: file.id,
    suffix,
  });

  const datasetHash = sha256File(trainPath);
  addHistoryEntry({
    model_id: job.id,
    job_id: job.id,
    created_at: new Date().toISOString(),
    dataset_hash: datasetHash,
    status: "training",
  });

  console.log(
    JSON.stringify(
      {
        job_id: job.id,
        status: job.status,
        training_file: file.id,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
