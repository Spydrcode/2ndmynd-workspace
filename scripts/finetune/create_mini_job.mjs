import fs from 'fs';
import OpenAI from 'openai';

const filePath = 'data/fine_tune/train_v2_mini.jsonl';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error('Missing training file:', filePath);
  process.exit(2);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const upload = await client.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'fine-tune',
  });

  const job = await client.fineTuning.jobs.create({
    model: 'gpt-4o-mini-2024-07-18',
    training_file: upload.id,
    suffix: '2ndmynd-decision-v2-mini',
    hyperparameters: {
      n_epochs: 2,
      learning_rate_multiplier: 1.0,
    },
  });

  console.log('training_file_id:', upload.id);
  console.log('job_id:', job.id);
}

main().catch((err) => {
  console.error('Create mini job error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
