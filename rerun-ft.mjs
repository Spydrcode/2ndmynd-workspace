import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const training_file = "file-Fh4i3scVEG3VQdBLLK7w9j";

try {
  const job = await client.fineTuning.jobs.create({
    model: "gpt-4o-mini-2024-07-18",
    training_file,
    suffix: `2ndmynd-scenario-v1-rerun-${Date.now()}`,
  });

  console.log("NEW JOB:", job.id, "status:", job.status);
} catch (err) {
  console.error("ERROR creating job:", err);
  process.exitCode = 1;
}
