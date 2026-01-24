import fs from "node:fs";
import OpenAI from "openai";
import minimist from "minimist";

import { redact } from "./redact";

require("dotenv").config();

type Args = {
  jobId?: string;
};

const DEFAULTS: Args = {};

function parseArgs(argv: string[]): Args {
  const parsed = minimist(argv, {
    string: ["job_id"],
    alias: { job_id: "jobId" },
  });

  const jobId = (parsed.job_id as string | undefined) ?? (parsed.jobId as string | undefined) ?? parsed._[0];

  return {
    ...DEFAULTS,
    jobId,
  };
}

function ensureEnv() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY environment variable.");
    process.exit(1);
  }
}

function readJobArtifact() {
  try {
    const data = fs.readFileSync("./ml_artifacts/latest_finetune_job.json", "utf8");
    return JSON.parse(data);
  } catch {
    console.error("No latest_finetune_job.json found. Provide --job_id.");
    process.exit(1);
  }
}

function formatMaybe(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "(not provided)";
  }
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let jobId = args.jobId;
  if (!jobId) {
    const artifact = readJobArtifact();
    jobId = artifact.job_id;
  }

  try {
    const job = await client.fineTuning.jobs.retrieve(jobId!);

    console.log(`job.id: ${formatMaybe(job.id)}`);
    console.log(`job.status: ${formatMaybe(job.status)}`);
    console.log(`job.created_at: ${formatMaybe(job.created_at)}`);
    console.log(`job.finished_at: ${formatMaybe((job as { finished_at?: number | null }).finished_at)}`);
    console.log(`job.error: ${redact(formatMaybe(job.error))}`);
    console.log(`job.status_details: ${formatMaybe((job as { status_details?: unknown }).status_details)}`);
    console.log(`job.cancelled_at: ${formatMaybe((job as { cancelled_at?: number | null }).cancelled_at)}`);
    console.log(`job.canceled_at: ${formatMaybe((job as { canceled_at?: number | null }).canceled_at)}`);
    console.log(`job.canceled_by: ${formatMaybe((job as { canceled_by?: string | null }).canceled_by)}`);
    console.log(`job.cancellation_reason: ${formatMaybe((job as { cancellation_reason?: string | null }).cancellation_reason)}`);
    console.log(`job.fine_tuned_model: ${formatMaybe(job.fine_tuned_model)}`);
    console.log(`job.result_model: ${formatMaybe((job as { result_model?: string | null }).result_model)}`);
    console.log(`job.trained_tokens: ${formatMaybe((job as { trained_tokens?: number | null }).trained_tokens)}`);

    if (job.status === "succeeded") {
      process.exit(0);
    } else if (job.status === "running") {
      process.exit(2);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error(`Failed to retrieve job: ${redact(error instanceof Error ? error.message : String(error))}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
