import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const jobId = process.argv[2];
if (!jobId) { console.error('Usage: node inspect_ft_job.mjs <jobId>'); process.exit(2); }
try {
  const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 500 });
  for (const e of events.data) {
    console.log(new Date(e.created_at * 1000).toISOString(), '|', e.level ?? '', '|', e.message);
  }
  const job = await client.fineTuning.jobs.retrieve(jobId);
  console.log('\nJOB SUMMARY:');
  console.log(JSON.stringify(job, null, 2));
} catch (err) {
  console.error('ERROR:', err);
  process.exit(1);
}
