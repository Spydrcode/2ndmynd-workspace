import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const repaired = path.resolve('tmp/train_v2_repaired.jsonl');
const quarantined = path.resolve('tmp/train_v2_quarantined.jsonl');

function chooseFile(): string {
  if (fs.existsSync(repaired)) return repaired;
  if (fs.existsSync(quarantined)) {
    const count = fs.readFileSync(quarantined, 'utf8').split(/\r?\n/).filter(Boolean).length;
    if (count >= 20) return quarantined;
  }
  console.error('No acceptable clean file found. Place a repaired or quarantined file in tmp/.');
  process.exit(2);
}

async function main() {
  const filePath = chooseFile();
  console.log('Using training file:', filePath);
  const upload = await client.files.create({ file: fs.createReadStream(filePath), purpose: 'fine-tune' });
  console.log('Uploaded:', upload.id);
  const suffix = `2ndmynd-decision-v2-clean-${Date.now()}`;
  const job = await client.fineTuning.jobs.create({ model: process.env.FT_BASE_MODEL || 'gpt-4.1-mini-2025-04-14', training_file: upload.id, suffix });
  console.log('Job created:', job.id, 'training_file:', upload.id);
  // write latest artifact
  try {
    const outDir = path.resolve(process.cwd(), process.env.FT_OUT_DIR || 'ml_artifacts');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'latest_finetune_job.json'), JSON.stringify({ job_id: job.id, training_file: upload.id, model: job.model, created_at: job.created_at }, null, 2));
  } catch (e) {
    console.error('Failed to write artifact', e);
  }
}

main().catch((err) => { console.error('Error creating job:', err instanceof Error ? err.message : String(err)); process.exit(1); });
