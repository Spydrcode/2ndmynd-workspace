import fs from 'fs';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const repaired = 'tmp/train_v2_repaired.jsonl';
const quarantined = 'tmp/train_v2_quarantined.jsonl';

async function chooseFile() {
  if (fs.existsSync(repaired)) return repaired;
  if (fs.existsSync(quarantined)) {
    const count = fs.readFileSync(quarantined,'utf8').split(/\r?\n/).filter(Boolean).length;
    if (count >= 20) return quarantined;
  }
  console.error('No acceptable clean file found. Place a repaired or quarantined file in tmp/.');
  process.exit(2);
}

async function main(){
  if (!process.env.OPENAI_API_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1); }
  const filePath = await chooseFile();
  console.log('Using training file:', filePath);
  const upload = await client.files.create({ file: fs.createReadStream(filePath), purpose: 'fine-tune' });
  console.log('Uploaded:', upload.id);
  const suffix = `2ndmynd-decision-v2-clean-${Date.now()}`;
  const job = await client.fineTuning.jobs.create({
    model: process.env.FT_BASE_MODEL || 'gpt-4.1-mini',
    training_file: upload.id,
    suffix,
  });
  console.log('Job created:', job.id, 'training_file:', upload.id);
}

main().catch(err=>{ console.error('Error creating job:', err); process.exit(1); });
