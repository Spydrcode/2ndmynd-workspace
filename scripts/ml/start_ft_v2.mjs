import fs from 'fs';
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const filePath = 'data/fine_tune/train_v2.jsonl';
const baseModel = process.env.FT_BASE_MODEL || 'gpt-4.1-mini';
const suffix = `2ndmynd-decision-v2-${Date.now()}`;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (!fs.existsSync(filePath)) {
    console.error('Missing training file:', filePath);
    process.exit(1);
  }

  try {
    console.log('Uploading training file...');
    const upload = await client.files.create({ file: fs.createReadStream(filePath), purpose: 'fine-tune' });
    console.log('Uploaded:', upload.id);

    console.log('Creating fine-tune job...');
    const job = await client.fineTuning.jobs.create({ model: baseModel, training_file: upload.id, suffix });
    console.log('Job created:', job.id, 'status:', job.status);

    const TERMINAL = new Set(['succeeded','failed','cancelled']);
    let current = job;
    while (!TERMINAL.has(current.status)) {
      console.log('Waiting 10s for job events...');
      await sleep(10000);
      current = await client.fineTuning.jobs.retrieve(job.id);
      console.log('status:', current.status, 'progress:', current.progress ?? 'n/a');
    }

    console.log('Final status:', current.status);
    if (current.status === 'succeeded') {
      console.log('Fine-tuned model id:', current.fine_tuned_model);
    } else {
      console.error('Fine-tune did not succeed:', current.status);
    }
  } catch (err) {
    console.error('Error during fine-tune:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
