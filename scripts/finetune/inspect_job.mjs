import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: node scripts/finetune/inspect_job.mjs <jobId>');
  process.exit(2);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const job = await client.fineTuning.jobs.retrieve(jobId);
  const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 200 });
  const last = events.data.slice(0, 40).reverse();

  const status = job.status;
  const trainedTokens = job.trained_tokens ?? null;
  const error = job.error ?? null;

  let hasTrainingError = false;
  let hasReenqueue = false;

  for (const e of last) {
    const msg = (e.message ?? '').toLowerCase();
    if (msg.includes('experienced an error while training')) hasTrainingError = true;
    if (msg.includes('re-enqueued for retry')) hasReenqueue = true;
  }

  console.log('status:', status);
  console.log('trained_tokens:', trainedTokens);
  console.log('error:', error ? JSON.stringify(error) : 'null');
  console.log('contains_training_error_message:', hasTrainingError ? 'yes' : 'no');
  console.log('contains_reenqueue_message:', hasReenqueue ? 'yes' : 'no');

  const stalled = status === 'running' && (!trainedTokens || trainedTokens === 0) && !hasTrainingError && !hasReenqueue;
  console.log('stalled:', stalled ? 'yes' : 'no');
  console.log('last_40_events (oldest -> newest):');
  for (const e of last) {
    console.log(e.created_at, e.level ?? '', e.message ?? '');
  }
}

main().catch((err) => {
  console.error('Inspect error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
