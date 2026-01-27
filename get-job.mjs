import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const jobId = "ftjob-s3w8hG4PfdkIs3vtx1xefHDJ";

try {
  const job = await client.fineTuning.jobs.retrieve(jobId);
  console.log("JOB:", job);
  console.log("cancelled_at:", job.cancelled_at ?? null);
  console.log("cancellation_reason:", job.cancellation_reason ?? null);
  console.log("canceled_by / canceled_at fields:", job.canceled_by ?? null, job.canceled_at ?? null);
  const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 200 });
  console.log("EVENTS (full objects):");
  for (const e of events.data) {
    console.log(JSON.stringify(e));
  }
} catch (err) {
  console.error("ERROR:", err);
  process.exitCode = 1;
}
