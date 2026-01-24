import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

import { exportDatasetToJsonl } from "./export_dataset_to_jsonl";
import { redact } from "./redact";

require("dotenv").config();

type Args = {
  trainDataset: string;
  trainFile: string;
  baseModel: string;
  suffix: string;
  registryName: string;
  autoActivate: boolean;
  jobId?: string;
  epochs: number;
  batchSize: number;
  lrMultiplier: number;
  pollSeconds: number;
  maxWaitMinutes: number;
};

const DEFAULTS: Args = {
  trainDataset: "scenario_train_v1",
  trainFile: "./ml_artifacts/scenario_train_v1.jsonl",
  baseModel: "gpt-4o-mini-2024-07-18",
  suffix: "2ndmynd-scenario-v1",
  registryName: "decision_model",
  autoActivate: false,
  epochs: 3,
  batchSize: 1,
  lrMultiplier: 1.0,
  pollSeconds: 45,
  maxWaitMinutes: 240,
};

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

function registerExitHandlers() {
  const logExit = () => {
    console.log("Process exiting; NOT cancelling job");
  };

  process.on("SIGINT", () => {
    logExit();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logExit();
    process.exit(0);
  });

  process.on("uncaughtException", (error) => {
    logExit();
    console.error(redact(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (value === undefined) continue;

    switch (key) {
      case "--train_dataset":
        args.trainDataset = value;
        break;
      case "--train_file":
        args.trainFile = value;
        break;
      case "--base_model":
        args.baseModel = value;
        break;
      case "--suffix":
        args.suffix = value;
        break;
      case "--registry_name":
        args.registryName = value;
        break;
      case "--auto_activate":
        args.autoActivate = value ? value !== "false" : true;
        break;
      case "--job_id":
        args.jobId = value;
        break;
      case "--epochs":
        args.epochs = Number(value);
        break;
      case "--batch_size":
        args.batchSize = Number(value);
        break;
      case "--lr_multiplier":
        args.lrMultiplier = Number(value);
        break;
      case "--poll_seconds":
        args.pollSeconds = Number(value);
        break;
      case "--max_wait_minutes":
        args.maxWaitMinutes = Number(value);
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

function writeJobArtifact(jobId: string, createdAt: string, trainDataset: string, trainFile: string, baseModel: string, suffix: string) {
  const artifact = {
    job_id: jobId,
    created_at: createdAt,
    train_dataset: trainDataset,
    train_file: trainFile,
    base_model: baseModel,
    suffix,
  };
  fs.mkdirSync(path.dirname("./ml_artifacts/latest_finetune_job.json"), { recursive: true });
  fs.writeFileSync("./ml_artifacts/latest_finetune_job.json", JSON.stringify(artifact, null, 2));
  console.log(`Job artifact written: ${jobId}`);
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
    console.error(`Failed to record run: ${redact(error?.message ?? "unknown error")}`);
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
    console.error(`Failed to update run: ${redact(error.message)}`);
  }
}

async function maybeActivateModel(name: string, modelId: string) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await supabase
    .schema("ml")
    .from("model_registry")
    .upsert(
      {
        name,
        model_id: modelId,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );

  if (error) {
    console.error(`Failed to activate model: ${redact(error.message)}`);
    return false;
  }

  console.log(`active model set: ${name} -> ${modelId}`);
  return true;
}

async function main() {
  registerExitHandlers();
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let jobId: string | undefined = args.jobId;
  let currentJob: any = null;

  if (jobId) {
    // Resume existing job
    try {
      currentJob = await client.fineTuning.jobs.retrieve(jobId);
    } catch (error) {
      console.error(`Failed to retrieve job ${jobId}: ${redact(error instanceof Error ? error.message : String(error))}`);
      process.exit(1);
    }
  } else {
    // Create new job
    const filePath = path.resolve(args.trainFile);
    const fileExists = fs.existsSync(filePath);
    if (!fileExists) {
      console.log(`training file missing, exporting dataset ${args.trainDataset}`);
      await exportDatasetToJsonl({ name: args.trainDataset, out: filePath });
    }

    if (!fs.existsSync(filePath)) {
      console.error(`Missing file: ${filePath}`);
      process.exit(1);
    }

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
      console.error(redact(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }

    const upload = await client.files.create({
      file: fs.createReadStream(filePath),
      purpose: "fine-tune",
    });

    const job = await client.fineTuning.jobs.create({
      training_file: upload.id,
      model: args.baseModel,
      suffix: args.suffix,
      hyperparameters: {
        n_epochs: args.epochs,
        batch_size: args.batchSize,
        learning_rate_multiplier: args.lrMultiplier,
      },
    });

    jobId = job.id;
    currentJob = job;

    // Write artifact immediately
    writeJobArtifact(jobId, new Date().toISOString(), args.trainDataset, filePath, args.baseModel, args.suffix);
  }

  if (!jobId) {
    throw new Error("Job ID not set");
  }

  // Now poll the job
  const startedAt = new Date().toISOString();
  const fileHash = args.jobId ? null : sha256File(path.resolve(args.trainFile));
  const metrics = {
    jsonl_sha256: fileHash,
    file_path: args.trainFile,
    dataset: args.trainDataset,
    started_at: startedAt,
  };

  const runId = await insertRun({
    status: "running",
    baseModel: args.baseModel,
    datasetName: args.trainDataset,
    metrics,
    jobId,
  });

  if (runId) {
    await updateRun(runId, { openai_job_id: jobId });
  }

  let current = currentJob;
  const started = Date.now();
  const pollInterval = Math.max(1, args.pollSeconds) * 1000;
  const maxWaitMs = args.maxWaitMinutes * 60 * 1000;

  while (!TERMINAL_STATUSES.has(current.status)) {
    await sleep(pollInterval);
    if (Date.now() - started > maxWaitMs) {
      console.log(`Job still running. Resume with --job_id ${jobId} to continue.`);
      process.exit(0);
    }
    current = await client.fineTuning.jobs.retrieve(jobId!);
  }

  const finishedAt = new Date().toISOString();
  if (current.status === "succeeded") {
    if (runId) {
      await updateRun(runId, {
        run_status: "succeeded",
        result_model: current.fine_tuned_model ?? null,
        metrics: {
          ...metrics,
          finished_at: finishedAt,
          openai_status: current.status,
          fine_tuned_model: current.fine_tuned_model ?? null,
        },
      });
    }

    console.log("fine-tune completed");
    console.log(`model: ${current.fine_tuned_model}`);

    if (args.autoActivate && current.fine_tuned_model) {
      await maybeActivateModel(args.registryName, current.fine_tuned_model);
    }

    return;
  }

  if (runId) {
    await updateRun(runId, {
      run_status: current.status,
      result_model: null,
      metrics: {
        ...metrics,
        finished_at: finishedAt,
        openai_status: current.status,
      },
    });
  }

  console.error(`fine-tune failed: ${current.status}`);
  process.exit(1);

}
main().catch((error) => {
  console.error('Unexpected failure.');
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
