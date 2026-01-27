import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: node scripts/finetune/tail_job_once.mjs <jobId>');
  process.exit(2);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const seen = new Set();
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

function eventKey(e) {
  return `${e.created_at}-${e.message ?? ''}`;
}

async function main() {
  while (true) {
    const job = await client.fineTuning.jobs.retrieve(jobId);
    const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 200 });
    const ordered = events.data.slice().reverse();

    console.log(new Date().toISOString(), 'status:', job.status, 'trained_tokens:', job.trained_tokens ?? 'null');

    for (const e of ordered) {
      const key = eventKey(e);
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(e.created_at, e.level ?? '', e.message ?? '');
    }

    if (TERMINAL.has(job.status)) {
      console.log('Final status:', job.status);
      console.log('trained_tokens:', job.trained_tokens ?? 'null');
      process.exit(0);
    }

    await new Promise((r) => setTimeout(r, 15000));
  }
}

main().catch((err) => {
  console.error('Tail error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
