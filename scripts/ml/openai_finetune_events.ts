import fs from "node:fs";
import OpenAI from "openai";
import minimist from "minimist";

import { redact } from "./redact";

require("dotenv").config();

type Args = {
  jobId?: string;
  tail: number;
};

const DEFAULTS: Args = {
  tail: 100,
};

function parseArgs(argv: string[]): Args {
  const parsed = minimist(argv, {
    string: ["job_id"],
    alias: { job_id: "jobId" },
    default: { tail: DEFAULTS.tail },
  });

  const jobId = (parsed.job_id as string | undefined) ?? (parsed.jobId as string | undefined) ?? parsed._[0];
  const tailRaw = parsed.tail as string | number | undefined;
  const tail = typeof tailRaw === "string" ? Number(tailRaw) : typeof tailRaw === "number" ? tailRaw : DEFAULTS.tail;

  return {
    ...DEFAULTS,
    jobId,
    tail: Number.isFinite(tail) && tail > 0 ? tail : DEFAULTS.tail,
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

function formatEventLine(event: { created_at?: number | null; level?: string | null; message?: string | null }) {
  const createdAt = typeof event.created_at === "number" ? new Date(event.created_at * 1000).toISOString() : "unknown";
  const level = event.level ?? "info";
  const message = event.message ?? "";
  return `[${createdAt}] ${level} ${message}`;
}

async function fetchAllEvents(client: OpenAI, jobId: string) {
  const collected: Array<{ created_at?: number | null; level?: string | null; message?: string | null }> = [];
  let after: string | undefined = undefined;

  while (true) {
    const page = await client.fineTuning.jobs.listEvents(jobId, { limit: 100, after });
    collected.push(...page.data);
    if (!page.has_more || !page.last_id) {
      break;
    }
    after = page.last_id;
  }

  return collected;
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

  if (!jobId) {
    console.error("Missing job_id. Provide --job_id or ensure latest_finetune_job.json exists.");
    process.exit(1);
  }

  try {
    const events = await fetchAllEvents(client, jobId);
    const sorted = events
      .slice()
      .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
      .slice(-args.tail);

    for (const event of sorted) {
      console.log(redact(formatEventLine(event)));
    }
  } catch (error) {
    console.error(`Failed to retrieve events: ${redact(error instanceof Error ? error.message : String(error))}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
