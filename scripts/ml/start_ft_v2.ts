import fs from 'fs';
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const filePath = process.env.FT_TRAINING_FILE || 'data/fine_tune/train_v2.jsonl';
const baseModel = process.env.FT_BASE_MODEL || 'gpt-4.1-mini-2025-04-14';
const suffix = `2ndmynd-decision-v2-${Date.now()}`;

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  if (!fs.existsSync(filePath)) {
    console.error('Missing training file:', filePath);
    process.exit(1);
  }

  try {
    console.log('Uploading training file...');
    const upload = await client.files.create({ file: fs.createReadStream(filePath), purpose: 'fine-tune' });
    console.log('Uploaded:', upload.id);

      // optionally upload validation file
      let validationUpload: any = null;
      const validationPath = process.env.FT_VALIDATION_FILE;
      if (validationPath && fs.existsSync(validationPath)) {
        console.log('Uploading validation file...', validationPath);
        validationUpload = await client.files.create({ file: fs.createReadStream(validationPath), purpose: 'fine-tune' });
        console.log('Validation uploaded:', validationUpload.id);
      }

      console.log('Creating fine-tune job...');
      const createBody: any = { model: baseModel, training_file: upload.id, suffix };
      if (validationUpload) createBody.validation_file = validationUpload.id;
      const epochs = Number(process.env.FT_EPOCHS || process.env.FT_EPOCHS_OVERRIDE || 2);
      const lr = Number(process.env.FT_LR_MULTIPLIER || process.env.FT_LR || 1.2);
      const batch = Number(process.env.FT_BATCH_SIZE || 1);
      createBody.hyperparameters = {};
      if (Number.isFinite(epochs)) createBody.hyperparameters.n_epochs = epochs;
      if (Number.isFinite(lr)) createBody.hyperparameters.learning_rate_multiplier = lr;
      if (Number.isFinite(batch)) createBody.hyperparameters.batch_size = batch;

      const job = await client.fineTuning.jobs.create(createBody);
    console.log('Job created:', job.id, 'status:', job.status);

    const TERMINAL = new Set(['succeeded','failed','cancelled']);
    let current = job as any;
    while (!TERMINAL.has(current.status)) {
      console.log('Waiting', (process.env.FT_POLL_SECONDS ?? '10'), 's for job events...');
      await sleep(Number(process.env.FT_POLL_SECONDS ?? 10) * 1000);
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
