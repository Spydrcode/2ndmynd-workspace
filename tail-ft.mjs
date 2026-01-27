import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const jobId = process.argv[2];

if (!jobId) {
  console.error("Usage: node tail-ft.mjs <ftjob-id>");
  process.exit(1);
}

const terminal = new Set(["succeeded", "failed", "cancelled"]);

let lastSeen = new Set();

while (true) {
  const job = await client.fineTuning.jobs.retrieve(jobId);

  const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 50 });
  for (const e of [...events.data].reverse()) {
    const key = `${e.created_at}|${e.message}`;
    if (!lastSeen.has(key)) {
      console.log(`${e.created_at} | ${e.level ?? ""} | ${e.message}`);
      lastSeen.add(key);
    }
  }

  console.log(`STATUS: ${job.status}`);

  if (terminal.has(job.status)) {
    console.log("FINAL JOB:", job);
    process.exit(0);
  }

  await new Promise((r) => setTimeout(r, 15000));
}
