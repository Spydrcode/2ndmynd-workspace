import minimist from "minimist";
import OpenAI from "openai";

async function run() {
  const args = minimist(process.argv.slice(2));
  const jobId = args.job_id ?? process.env.OPENAI_FINE_TUNE_JOB_ID;
  if (!jobId) {
    throw new Error("Provide --job_id or set OPENAI_FINE_TUNE_JOB_ID.");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to query fine-tune status.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const job = await client.fineTuning.jobs.retrieve(jobId);

  console.log(
    JSON.stringify(
      {
        job_id: job.id,
        status: job.status,
        fine_tuned_model: job.fine_tuned_model ?? null,
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
