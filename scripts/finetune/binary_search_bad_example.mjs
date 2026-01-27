import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const src = 'data/fine_tune/train_v2_repaired.jsonl';
const tmpDir = 'tmp';
const baseModel = 'gpt-4o-mini-2024-07-18';
const suffixBase = '2ndmynd-decision-v2-search';
const pollMs = 15000;
const stallMs = 30 * 60 * 1000;

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

if (!fs.existsSync(src)) {
  console.error('Missing source file:', src);
  process.exit(2);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function loadEntries() {
  const raw = fs.readFileSync(src, 'utf8');
  const lines = raw.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    entries.push({ lineNumber: i + 1, text: line });
  }
  return entries;
}

function writeSubset(entries, count) {
  const outDir = path.resolve(tmpDir);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `ft_search_${count}.jsonl`);
  const subset = entries.slice(0, count).map((e) => e.text);
  const outText = subset.join('\n') + (subset.length ? '\n' : '');
  fs.writeFileSync(outPath, outText);
  return outPath;
}

async function waitForJob(jobId) {
  const seen = new Set();
  let lastEventTime = Date.now();
  while (true) {
    const job = await client.fineTuning.jobs.retrieve(jobId);
    const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 200 });
    for (const e of events.data) {
      const key = `${e.created_at}-${e.message ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lastEventTime = Date.now();
    }

    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) {
      return { status: job.status, trainedTokens: job.trained_tokens ?? null };
    }

    const noTokens = !job.trained_tokens || job.trained_tokens === 0;
    if (job.status === 'running' && noTokens && Date.now() - lastEventTime > stallMs) {
      return { status: 'stalled', trainedTokens: job.trained_tokens ?? null };
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

async function runJobWithCount(entries, count) {
  const filePath = writeSubset(entries, count);
  const upload = await client.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'fine-tune',
  });

  const job = await client.fineTuning.jobs.create({
    model: baseModel,
    training_file: upload.id,
    suffix: `${suffixBase}-${count}`,
    hyperparameters: {
      n_epochs: 2,
      learning_rate_multiplier: 1.0,
    },
  });

  console.log(`job_started count=${count} job_id=${job.id} training_file_id=${upload.id}`);
  const result = await waitForJob(job.id);
  console.log(`job_result count=${count} status=${result.status} trained_tokens=${result.trainedTokens ?? 'null'}`);
  return result.status === 'succeeded';
}

async function main() {
  const entries = loadEntries();
  console.log('total_examples:', entries.length);

  const startCount = Math.min(50, entries.length);
  const step = 25;

  let lastSuccess = 0;
  let firstFail = null;

  let current = startCount;
  while (current <= entries.length) {
    const ok = await runJobWithCount(entries, current);
    if (ok) {
      lastSuccess = current;
      current += step;
    } else {
      firstFail = current;
      break;
    }
  }

  if (firstFail === null) {
    console.log('No failure or stall detected up to full dataset.');
    process.exit(0);
  }

  let low = lastSuccess;
  let high = firstFail;

  while (high - low > 3) {
    const mid = Math.floor((low + high) / 2);
    const ok = await runJobWithCount(entries, mid);
    if (ok) {
      low = mid;
    } else {
      high = mid;
    }
  }

  console.log(`Suspected bad example range: ${low + 1}..${high}`);
  for (let i = low; i < high; i += 1) {
    const entry = entries[i];
    if (!entry) continue;
    console.log(`LINE ${entry.lineNumber} PREVIEW ${entry.text.slice(0, 200)}`);
  }
}

main().catch((err) => {
  console.error('Binary search error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
