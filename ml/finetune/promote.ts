import fs from "node:fs";
import crypto from "node:crypto";
import minimist from "minimist";
import OpenAI from "openai";
import { runEval } from "../evals/eval_runner";
import { addHistoryEntry, loadRegistry, setCandidate, setChampion } from "../registry/registry";

function sha256File(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function resolveModelId(args: minimist.ParsedArgs): Promise<{ model_id: string; job_id?: string }> {
  if (args.model_id) {
    return { model_id: String(args.model_id) };
  }
  const jobId = args.job_id ?? process.env.OPENAI_FINE_TUNE_JOB_ID;
  if (!jobId) {
    throw new Error("Provide --model_id or --job_id.");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to resolve fine-tune job.");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const job = await client.fineTuning.jobs.retrieve(String(jobId));
  if (!job.fine_tuned_model) {
    throw new Error(`Fine-tune job not ready: ${job.status}`);
  }
  return { model_id: job.fine_tuned_model, job_id: job.id };
}

async function run() {
  const args = minimist(process.argv.slice(2));
  const { model_id, job_id } = await resolveModelId(args);
  const registry = loadRegistry();
  const datasetPath = args.dataset ?? process.env.ML_TRAIN_JSONL_PATH;
  const datasetHash = datasetPath && fs.existsSync(datasetPath) ? sha256File(datasetPath) : "unknown";

  setCandidate(model_id);
  const evalResult = await runEval(model_id, registry.champion_model_id ?? undefined);

  if (evalResult.decision.pass) {
    setChampion(model_id);
    setCandidate(null);
    addHistoryEntry({
      model_id,
      job_id,
      created_at: new Date().toISOString(),
      dataset_hash: datasetHash,
      eval_report_path: evalResult.report_md,
      status: "champion",
    });
  } else {
    setCandidate(null);
    addHistoryEntry({
      model_id,
      job_id,
      created_at: new Date().toISOString(),
      dataset_hash: datasetHash,
      eval_report_path: evalResult.report_md,
      status: "rejected",
    });
  }

  console.log(
    JSON.stringify(
      {
        model_id,
        promoted: evalResult.decision.pass,
        report: evalResult.report_md,
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
