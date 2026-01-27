import fs from 'fs';
import OpenAI from 'openai';

const filePath = 'data/fine_tune/train_v2_final.jsonl';
const pollMs = 15000;
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error('Missing training file:', filePath);
  process.exit(2);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function hasMetricsEvent(e) {
  const msg = (e.message ?? '').toLowerCase();
  if (msg.includes('loss') || msg.includes('metrics')) return true;
  if (e.data && typeof e.data === 'object' && Object.keys(e.data).length > 0) return true;
  return false;
}

async function main() {
  const upload = await client.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'fine-tune',
  });

  const job = await client.fineTuning.jobs.create({
    model: 'gpt-4o-mini-2024-07-18',
    training_file: upload.id,
    suffix: '2ndmynd-decision-v2-final',
    hyperparameters: {
      n_epochs: 2,
      learning_rate_multiplier: 1.0,
    },
  });

  console.log('training_file_id:', upload.id);
  console.log('job_id:', job.id);

  const seen = new Set();
  let metricsSeen = false;

  while (true) {
    const current = await client.fineTuning.jobs.retrieve(job.id);
    const events = await client.fineTuning.jobs.listEvents(job.id, { limit: 200 });
    const ordered = events.data.slice().reverse();

    console.log(new Date().toISOString(), 'status:', current.status, 'trained_tokens:', current.trained_tokens ?? 'null');

    for (const e of ordered) {
      const key = `${e.created_at}-${e.message ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (hasMetricsEvent(e)) metricsSeen = true;
      console.log(e.created_at, e.level ?? '', e.message ?? '');
    }

    if (TERMINAL.has(current.status)) {
      console.log('Final status:', current.status);
      console.log('trained_tokens:', current.trained_tokens ?? 'null');
      console.log('metrics_seen:', metricsSeen ? 'yes' : 'no');

      if (current.status !== 'succeeded') process.exit(1);
      if (!current.trained_tokens) process.exit(3);
      if (!metricsSeen) process.exit(4);
      console.log('fine_tuned_model:', current.fine_tuned_model ?? 'null');
      process.exit(0);
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

main().catch((err) => {
  console.error('Final job error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
