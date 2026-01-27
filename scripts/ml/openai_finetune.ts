import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

type Args = {
  file: string;
  baseModel: string;
  suffix: string;
  dataset: string;
  epochs?: number;
  lrMultiplier?: number;
  batchSize?: number;
};

const DEFAULTS: Args = {
  file: "./ml_artifacts/train_v1.jsonl",
  baseModel: "gpt-4o-mini-2024-07-18",
  suffix: "2ndmynd-train-v1",
  dataset: "train_v1",
};

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (value === undefined) continue;

    switch (key) {
      case "--file":
        args.file = value;
        break;
      case "--base_model":
        args.baseModel = value;
        break;
      case "--suffix":
        args.suffix = value;
        break;
      case "--dataset":
        args.dataset = value;
        break;
      case "--epochs":
        args.epochs = Number(value);
        break;
      case "--lr_multiplier":
        args.lrMultiplier = Number(value);
        break;
      case "--batch_size":
        args.batchSize = Number(value);
        break;
      default:
        break;
    }
  }
  return args;
}

function ensureEnv() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY environment variable.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL) {
    console.error("Missing SUPABASE_URL environment variable.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256File(filePath: string) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

async function insertRun(params: {
  status: "running" | "succeeded" | "failed" | "cancelled";
  baseModel: string;
  datasetName: string;
  metrics: Record<string, unknown>;
  resultModel?: string | null;
  jobId?: string | null;
}) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase
    .schema("ml")
    .from("runs")
    .insert({
      run_type: "finetune",
      run_status: params.status,
      base_model: params.baseModel,
      result_model: params.resultModel ?? null,
      dataset_name: params.datasetName,
      openai_job_id: params.jobId ?? null,
      metrics: params.metrics,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(
      `Failed to record run: ${error?.message ?? "unknown error"}`
    );
    return null;
  }

  return data.id as string;
}

async function updateRun(
  runId: string,
  updates: Partial<{
    run_status: "running" | "succeeded" | "failed" | "cancelled";
    result_model: string | null;
    openai_job_id: string | null;
    metrics: Record<string, unknown>;
  }>
) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await supabase
    .schema("ml")
    .from("runs")
    .update(updates)
    .eq("id", runId);

  if (error) {
    console.error(`Failed to update run: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const models = await client.models.list();
    const ids = new Set(models.data.map((model) => model.id));
    if (!ids.has(args.baseModel)) {
      console.error(`Base model not found in your account: ${args.baseModel}`);
      console.error("Try: gpt-4o-mini-2024-07-18");
      process.exit(1);
    }
  } catch (error) {
    console.error("Unable to validate base model.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const fileHash = sha256File(filePath);
  const metrics = {
    jsonl_sha256: fileHash,
    file_path: filePath,
    dataset: args.dataset,
  };

  const runId = await insertRun({
    status: "running",
    baseModel: args.baseModel,
    datasetName: args.dataset,
    metrics,
  });

  let jobId: string | null = null;

  try {
    const upload = await client.files.create({
      file: fs.createReadStream(filePath),
      purpose: "fine-tune",
    });

    const hyperparameters: Record<string, number> = {};
    if (Number.isFinite(args.epochs ?? NaN)) hyperparameters.n_epochs = args.epochs as number;
    if (Number.isFinite(args.lrMultiplier ?? NaN)) hyperparameters.learning_rate_multiplier = args.lrMultiplier as number;
    if (Number.isFinite(args.batchSize ?? NaN)) hyperparameters.batch_size = args.batchSize as number;

    const job = await client.fineTuning.jobs.create({
      training_file: upload.id,
      model: args.baseModel,
      suffix: args.suffix,
      ...(Object.keys(hyperparameters).length > 0 ? { hyperparameters } : {}),
    });

    jobId = job.id;
    if (runId) {
      await updateRun(runId, { openai_job_id: jobId });
    }

    let current = job;
    const started = Date.now();
    while (!TERMINAL_STATUSES.has(current.status)) {
      await sleep(10000);
      if (Date.now() - started > 60 * 60 * 1000) {
        throw new Error("fine-tune timed out after 60 minutes");
      }
      current = await client.fineTuning.jobs.retrieve(jobId);
    }

    if (current.status === "succeeded") {
      if (runId) {
        await updateRun(runId, {
          run_status: "succeeded",
          result_model: current.fine_tuned_model ?? null,
          metrics: {
            ...metrics,
            openai_status: current.status,
            fine_tuned_model: current.fine_tuned_model ?? null,
          },
        });
      }

      console.log("fine-tune completed");
      console.log(`model: ${current.fine_tuned_model}`);
      return;
    }

    if (runId) {
      await updateRun(runId, {
        run_status: current.status,
        result_model: null,
        metrics: {
          ...metrics,
          openai_status: current.status,
        },
      });
    }

    console.error(`fine-tune failed: ${current.status}`);
    process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId) {
      await updateRun(runId, {
        run_status: "failed",
        result_model: null,
        openai_job_id: jobId,
        metrics: {
          ...metrics,
          openai_status: "failed",
          error: message,
        },
      });
    }

    console.error("fine-tune failed");
    if (message.toLowerCase().includes("model")) {
      console.error(`Base model not found in your account: ${args.baseModel}`);
      console.error("Try: gpt-4o-mini-2024-07-18");
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
