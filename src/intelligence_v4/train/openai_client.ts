import fs from "node:fs";

import OpenAI from "openai";

export type OpenAiFineTuneParams = {
  training_file_path: string;
  base_model: string;
  suffix: string;
  n_epochs?: number;
  learning_rate_multiplier?: number;
  seed?: number;
};

export type OpenAiFineTuneResult = {
  file_id: string;
  job_id: string;
  status: string;
  base_model: string;
};

export type OpenAiFineTuneJobStatus = {
  job_id: string;
  status: string;
  fine_tuned_model: string | null;
};

export type OpenAiFineTuneJobRecord = {
  id: string;
  status: string;
  model: string;
  fine_tuned_model: string | null;
  created_at: string | null;
  finished_at: string | null;
  trained_tokens: number | null;
  organization_id: string | null;
  training_file: string | null;
  validation_file: string | null;
};

export type OpenAiFineTuneEventRecord = {
  id: string;
  created_at: string | null;
  level: string | null;
  message: string;
  type: string | null;
};

function ensureOpenAiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Missing OPENAI_API_KEY. Set it in your environment to run fine-tuning with --dry_run=false."
    );
  }
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  return null;
}

function createOpenAiClient(): OpenAI {
  ensureOpenAiKey();
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    project: process.env.OPENAI_PROJECT ?? process.env.OPENAI_PROJECT_ID,
    organization: process.env.OPENAI_ORG_ID,
  });
}

function mapFineTuneJob(job: unknown): OpenAiFineTuneJobRecord {
  const typed = job as {
    id?: unknown;
    status?: unknown;
    model?: unknown;
    fine_tuned_model?: unknown;
    created_at?: unknown;
    finished_at?: unknown;
    trained_tokens?: unknown;
    organization_id?: unknown;
    training_file?: unknown;
    validation_file?: unknown;
  };

  return {
    id: typeof typed.id === "string" ? typed.id : "unknown",
    status: typeof typed.status === "string" ? typed.status : "unknown",
    model: typeof typed.model === "string" ? typed.model : "unknown",
    fine_tuned_model: typeof typed.fine_tuned_model === "string" ? typed.fine_tuned_model : null,
    created_at: toIsoOrNull(typed.created_at),
    finished_at: toIsoOrNull(typed.finished_at),
    trained_tokens: typeof typed.trained_tokens === "number" ? typed.trained_tokens : null,
    organization_id: typeof typed.organization_id === "string" ? typed.organization_id : null,
    training_file: typeof typed.training_file === "string" ? typed.training_file : null,
    validation_file: typeof typed.validation_file === "string" ? typed.validation_file : null,
  };
}

function mapFineTuneEvent(event: unknown): OpenAiFineTuneEventRecord {
  const typed = event as {
    id?: unknown;
    created_at?: unknown;
    level?: unknown;
    message?: unknown;
    type?: unknown;
  };

  return {
    id: typeof typed.id === "string" ? typed.id : "unknown",
    created_at: toIsoOrNull(typed.created_at),
    level: typeof typed.level === "string" ? typed.level : null,
    message: typeof typed.message === "string" ? typed.message : "",
    type: typeof typed.type === "string" ? typed.type : null,
  };
}

export async function createFineTuneJob(params: OpenAiFineTuneParams): Promise<OpenAiFineTuneResult> {
  if (!fs.existsSync(params.training_file_path)) {
    throw new Error(`Training file not found: ${params.training_file_path}`);
  }

  const client = createOpenAiClient();
  const upload = await client.files.create({
    file: fs.createReadStream(params.training_file_path),
    purpose: "fine-tune",
  });

  const hyperparameters: Record<string, number> = {};
  if (Number.isFinite(params.n_epochs ?? Number.NaN)) {
    hyperparameters.n_epochs = params.n_epochs as number;
  }
  if (Number.isFinite(params.learning_rate_multiplier ?? Number.NaN)) {
    hyperparameters.learning_rate_multiplier = params.learning_rate_multiplier as number;
  }

  const requestBody: {
    training_file: string;
    model: string;
    suffix: string;
    hyperparameters?: Record<string, number>;
    seed?: number;
  } = {
    training_file: upload.id,
    model: params.base_model,
    suffix: params.suffix,
  };

  if (Object.keys(hyperparameters).length > 0) {
    requestBody.hyperparameters = hyperparameters;
  }
  if (Number.isFinite(params.seed ?? Number.NaN)) {
    requestBody.seed = params.seed;
  }

  const job = await client.fineTuning.jobs.create(requestBody);

  return {
    file_id: upload.id,
    job_id: job.id,
    status: job.status,
    base_model: params.base_model,
  };
}

export async function getFineTuneJobStatus(job_id: string): Promise<OpenAiFineTuneJobStatus> {
  const client = createOpenAiClient();
  const job = await client.fineTuning.jobs.retrieve(job_id);
  return {
    job_id: job.id,
    status: job.status,
    fine_tuned_model: job.fine_tuned_model ?? null,
  };
}

export async function listFineTuneJobs(limit = 20): Promise<OpenAiFineTuneJobRecord[]> {
  const client = createOpenAiClient();
  const page = await client.fineTuning.jobs.list({
    limit: Math.max(1, Math.min(100, Math.floor(limit))),
  });
  return page.data.map((job) => mapFineTuneJob(job));
}

export async function getFineTuneJob(job_id: string): Promise<OpenAiFineTuneJobRecord> {
  const client = createOpenAiClient();
  const job = await client.fineTuning.jobs.retrieve(job_id);
  return mapFineTuneJob(job);
}

export async function listFineTuneEvents(job_id: string, limit = 20): Promise<OpenAiFineTuneEventRecord[]> {
  const client = createOpenAiClient();
  const page = await client.fineTuning.jobs.listEvents(job_id, {
    limit: Math.max(1, Math.min(100, Math.floor(limit))),
  });
  return page.data.map((event) => mapFineTuneEvent(event));
}
