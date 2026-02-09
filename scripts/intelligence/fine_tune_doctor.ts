import { listFineTuneEvents, listFineTuneJobs, getFineTuneJob } from "../../src/intelligence_v4/train/openai_client";
import { parseBooleanArg, readCliArg } from "../../src/intelligence_v4/train/cli_args";

type FineTuneDoctorArgs = {
  list: boolean;
  limit: number;
  job_id?: string;
  events: boolean;
  json: boolean;
  dry_run: boolean;
};

type FineTuneDoctorEnv = {
  has_api_key: boolean;
  api_key_env_vars: string[];
  project_header?: string;
};

type FineTuneDoctorListJob = {
  id: string;
  status: string;
  model: string;
  fine_tuned_model: string | null;
  created_at: string | null;
  organization_id: string | null;
};

type FineTuneDoctorJobDetail = FineTuneDoctorListJob & {
  finished_at: string | null;
  trained_tokens: number | null;
  training_file: string | null;
  validation_file: string | null;
};

type FineTuneDoctorEvent = {
  id: string;
  created_at: string | null;
  level: string | null;
  message: string;
  type: string | null;
};

export type FineTuneDoctorResult = {
  generated_at: string;
  env: FineTuneDoctorEnv;
  list: FineTuneDoctorListJob[];
  job?: FineTuneDoctorJobDetail;
  events?: FineTuneDoctorEvent[];
  errors: string[];
};

type FineTuneDoctorDeps = {
  listJobs: (limit: number) => Promise<FineTuneDoctorJobDetail[]>;
  getJob: (job_id: string) => Promise<FineTuneDoctorJobDetail>;
  listEvents: (job_id: string, limit: number) => Promise<FineTuneDoctorEvent[]>;
  env: NodeJS.ProcessEnv;
  now: () => Date;
};

function parseArgs(argv: string[]): FineTuneDoctorArgs {
  const limitRaw = Number(readCliArg(argv, "limit") ?? "20");
  return {
    list: parseBooleanArg(readCliArg(argv, "list"), true),
    limit: Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20,
    job_id: readCliArg(argv, "job_id")?.trim() || undefined,
    events: parseBooleanArg(readCliArg(argv, "events"), false),
    json: parseBooleanArg(readCliArg(argv, "json"), false),
    dry_run: parseBooleanArg(readCliArg(argv, "dry_run"), true),
  };
}

function inspectEnv(env: NodeJS.ProcessEnv): FineTuneDoctorEnv {
  const apiKeyVars = Object.entries(env)
    .filter(([key, value]) => key.includes("OPENAI") && key.includes("API_KEY") && typeof value === "string" && value.trim().length > 0)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));

  const projectValue = env.OPENAI_PROJECT ?? env.OPENAI_PROJECT_ID;
  const projectName = env.OPENAI_PROJECT ? "OPENAI_PROJECT" : env.OPENAI_PROJECT_ID ? "OPENAI_PROJECT_ID" : null;

  return {
    has_api_key: typeof env.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.trim().length > 0,
    api_key_env_vars: apiKeyVars,
    project_header: projectName && projectValue ? `${projectName}=${projectValue}` : undefined,
  };
}

function toListJob(job: FineTuneDoctorJobDetail): FineTuneDoctorListJob {
  return {
    id: job.id,
    status: job.status,
    model: job.model,
    fine_tuned_model: job.fine_tuned_model,
    created_at: job.created_at,
    organization_id: job.organization_id,
  };
}

const defaultDeps: FineTuneDoctorDeps = {
  listJobs: async (limit) => listFineTuneJobs(limit),
  getJob: async (job_id) => getFineTuneJob(job_id),
  listEvents: async (job_id, limit) => listFineTuneEvents(job_id, limit),
  env: process.env,
  now: () => new Date(),
};

export async function runFineTuneDoctor(
  args: FineTuneDoctorArgs,
  deps: Partial<FineTuneDoctorDeps> = {}
): Promise<FineTuneDoctorResult> {
  const d: FineTuneDoctorDeps = { ...defaultDeps, ...deps };
  const env = inspectEnv(d.env);
  const errors: string[] = [];
  const result: FineTuneDoctorResult = {
    generated_at: d.now().toISOString(),
    env,
    list: [],
    errors,
  };

  if (!env.has_api_key) {
    errors.push("OPENAI_API_KEY not set. Fine-tune API calls are unavailable.");
    return result;
  }

  if (args.list) {
    try {
      const jobs = await d.listJobs(args.limit);
      result.list = jobs.map((job) => toListJob(job));
    } catch (error) {
      errors.push(`list_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (args.job_id) {
    try {
      result.job = await d.getJob(args.job_id);
    } catch (error) {
      errors.push(`job_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (args.events) {
    if (!args.job_id) {
      errors.push("events_requested_without_job_id");
    } else {
      try {
        result.events = await d.listEvents(args.job_id, args.limit);
      } catch (error) {
        errors.push(`events_failed:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return result;
}

export function renderFineTuneDoctorReport(result: FineTuneDoctorResult): string {
  const lines: string[] = [];

  lines.push("Fine-Tune Doctor");
  lines.push(`Current time: ${result.generated_at}`);
  lines.push(
    `API key env vars detected: ${
      result.env.api_key_env_vars.length > 0 ? result.env.api_key_env_vars.join(", ") : "none"
    }`
  );
  lines.push(`Project header env: ${result.env.project_header ?? "none"}`);

  lines.push("");
  lines.push(`Jobs (${result.list.length}):`);
  if (result.list.length === 0) {
    lines.push("- none");
  } else {
    for (const job of result.list) {
      lines.push(
        `- ${job.id} | ${job.status} | model=${job.model} | fine_tuned_model=${job.fine_tuned_model ?? "n/a"} | created_at=${
          job.created_at ?? "n/a"
        } | organization_id=${job.organization_id ?? "n/a"}`
      );
    }
  }

  if (result.job) {
    lines.push("");
    lines.push(`Job detail (${result.job.id}):`);
    lines.push(`- status: ${result.job.status}`);
    lines.push(`- model: ${result.job.model}`);
    lines.push(`- fine_tuned_model: ${result.job.fine_tuned_model ?? "n/a"}`);
    lines.push(`- created_at: ${result.job.created_at ?? "n/a"}`);
    lines.push(`- finished_at: ${result.job.finished_at ?? "n/a"}`);
    lines.push(`- trained_tokens: ${result.job.trained_tokens ?? "n/a"}`);
    lines.push(`- organization_id: ${result.job.organization_id ?? "n/a"}`);
    lines.push(`- training_file: ${result.job.training_file ?? "n/a"}`);
    lines.push(`- validation_file: ${result.job.validation_file ?? "n/a"}`);
  }

  if (result.events) {
    lines.push("");
    lines.push(`Events (${result.events.length}):`);
    for (const event of result.events) {
      lines.push(
        `- ${event.id} | ${event.level ?? "n/a"} | ${event.type ?? "n/a"} | ${event.created_at ?? "n/a"} | ${
          event.message
        }`
      );
    }
    if (result.events.length === 0) {
      lines.push("- none");
    }
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  void args.dry_run; // Explicitly accepted for compatibility; doctor is always read-only.

  const result = await runFineTuneDoctor(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(renderFineTuneDoctorReport(result));
}

if (process.argv[1]?.includes("fine_tune_doctor.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}

