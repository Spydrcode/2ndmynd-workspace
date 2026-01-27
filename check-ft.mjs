import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const jobId = "ftjob-s3w8hG4PfdkIs3vtx1xefHDJ";

try {
  const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 200 });
  for (const e of events.data.reverse()) {
    console.log(`${e.created_at} | ${e.level ?? ""} | ${e.message}`);
  }
} catch (err) {
  console.error("ERROR:", err);
  process.exitCode = 1;
}
