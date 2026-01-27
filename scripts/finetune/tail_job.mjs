import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: node tail_job.mjs <jobId>');
  process.exit(2);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function tail() {
  let errorCount = 0;
  const TERMINAL = new Set(['succeeded','failed','cancelled']);
  while (true) {
    const job = await client.fineTuning.jobs.retrieve(jobId);
    const status = job.status;
    const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 200 });
    const recent = events.data.slice(-50);
    console.log(new Date().toISOString(), 'status:', status, 'trained_tokens:', job.trained_tokens ?? 'null');
    for (const e of recent) console.log(e.created_at, e.level ?? '', e.message?.slice(0,200));
    // check for looping message
    for (const e of recent) {
      if (e.message && e.message.toLowerCase().includes('experienced an error while training')) {
        errorCount++;
      }
    }
    if (errorCount > 1) {
      console.error('still looping');
      process.exit(3);
    }
    if (TERMINAL.has(status)) {
      console.log('Final status:', status);
      if (job.trained_tokens) console.log('trained_tokens:', job.trained_tokens);
      process.exit(0);
    }
    await new Promise(r => setTimeout(r, 15000));
  }
}

tail().catch(err=>{ console.error('Tail error:', err); process.exit(1); });
