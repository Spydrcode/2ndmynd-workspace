import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configurable via CLI or env
const argv = process.argv.slice(2);
const opts = {
  trainingFilePath: argv[0] || process.env.FT_TRAINING_FILE || null,
  baseModel: process.env.FT_BASE_MODEL || 'gpt-4.1-mini',
  fallbackModel: process.env.FT_FALLBACK_MODEL || 'gpt-4o-mini-2024-07-18',
  watchdogMinutes: Number(process.env.FT_WATCHDOG_MINUTES || 15),
  maxRetries: Number(process.env.FT_MAX_RETRIES || 5),
  switchAfter: Number(process.env.FT_SWITCH_AFTER || 3),
  pollIntervalSec: Number(process.env.FT_POLL_INTERVAL_SEC || 60),
};

const ARTIFACT_DIR = path.resolve(process.cwd(), 'ml_artifacts');
const LATEST = path.join(ARTIFACT_DIR, 'latest_finetune_job.json');
const LOG = path.join(ARTIFACT_DIR, 'finetune_watchdog_log.jsonl');

function appendLog(obj) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.appendFileSync(LOG, JSON.stringify(obj) + '\n');
  } catch (e) {
    console.error('Failed to append log', e);
  }
}

function writeLatest(obj) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(LATEST, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Failed to write latest artifact', e);
  }
}

async function chooseFile() {
  const repaired = path.resolve('tmp/train_v2_repaired.jsonl');
  const quarantined = path.resolve('tmp/train_v2_quarantined.jsonl');

  if (opts.trainingFilePath && fs.existsSync(opts.trainingFilePath)) return opts.trainingFilePath;
  if (fs.existsSync(repaired)) return repaired;
  if (fs.existsSync(quarantined)) {
    const count = fs.readFileSync(quarantined, 'utf8').split(/\r?\n/).filter(Boolean).length;
    if (count >= 20) return quarantined;
  }
  console.error('No acceptable training file found. Provide path or place repaired/quarantined file in tmp/.');
  process.exit(2);
}

async function createJob(model, training_file_id, suffix) {
  const job = await client.fineTuning.jobs.create({ model, training_file: training_file_id, suffix });
  const entry = {
    job_id: job.id,
    model,
    training_file: training_file_id,
    created_at: job.created_at,
    status: job.status,
  };
  writeLatest(entry);
  appendLog({ type: 'create', ts: Date.now(), ...entry });
  return job;
}

async function getLastEventAt(jobId) {
  try {
    const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 200 });
    if (!events || !events.data || events.data.length === 0) return null;
    // events.created_at are seconds since epoch
    const last = events.data.reduce((acc, e) => Math.max(acc, Number(e.created_at || 0)), 0);
    return last; // seconds
  } catch (e) {
    return null;
  }
}

async function retrieveJob(jobId) {
  return client.fineTuning.jobs.retrieve(jobId);
}

async function cancelJob(jobId) {
  try {
    const canceled = await client.fineTuning.jobs.cancel(jobId);
    appendLog({ type: 'cancel', ts: Date.now(), job_id: jobId, status: canceled.status });
    return canceled;
  } catch (e) {
    appendLog({ type: 'cancel_error', ts: Date.now(), job_id: jobId, error: String(e) });
    throw e;
  }
}

async function uploadIfNeeded(filePath) {
  // If filePath looks like an existing id, return it
  if (!filePath) return null;
  if (/^file-/.test(filePath) || /^flr-/.test(filePath)) return filePath;
  // else upload
  const upload = await client.files.create({ file: fs.createReadStream(filePath), purpose: 'fine-tune' });
  appendLog({ type: 'upload', ts: Date.now(), file: filePath, upload_id: upload.id });
  return upload.id;
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  const filePath = await chooseFile();
  const trainingFileId = await uploadIfNeeded(filePath);

  let attempts = 0;
  let model = opts.baseModel;
  let lastJob = null;

  while (attempts < opts.maxRetries) {
    attempts += 1;
    const suffix = `2ndmynd-watchdog-${Date.now()}-a${attempts}`;
    console.log('Creating job attempt', attempts, 'model', model);
    const job = await createJob(model, trainingFileId, suffix);
    lastJob = job;

    // monitor
    const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
    let lastEventAt = await getLastEventAt(job.id) || job.created_at || Math.floor(Date.now()/1000);
    writeLatest({ job_id: job.id, model, created_at: job.created_at, last_event_at: lastEventAt, status: job.status, trained_tokens: job.trained_tokens ?? null });

    while (true) {
      await sleep(opts.pollIntervalSec * 1000);
      const j = await retrieveJob(job.id);
      const eventsAt = await getLastEventAt(job.id);
      if (eventsAt) lastEventAt = Math.max(lastEventAt, eventsAt);

      const entry = { job_id: j.id, model, created_at: j.created_at, last_event_at: lastEventAt, status: j.status, trained_tokens: j.trained_tokens ?? null };
      writeLatest(entry);
      appendLog({ type: 'status', ts: Date.now(), ...entry, attempt: attempts });

      const nowSec = Math.floor(Date.now() / 1000);

      if (TERMINAL.has(j.status)) {
        console.log('Job reached terminal status:', j.status);
        if (j.status === 'succeeded') return j;
        break; // go to next attempt
      }

      // Watchdog: If running, trained_tokens is null/undefined, and no new events for watchdogMinutes -> cancel and retry
      if (j.status === 'running' && (j.trained_tokens === null || j.trained_tokens === undefined)) {
        const idleSec = nowSec - (lastEventAt || j.created_at || nowSec);
        if (idleSec > opts.watchdogMinutes * 60) {
          console.warn(`Watchdog triggered: idle ${idleSec}s > ${opts.watchdogMinutes}m for job ${j.id}`);
          await cancelJob(j.id);
          appendLog({ type: 'watchdog_cancel', ts: Date.now(), job_id: j.id, idle_sec: idleSec, attempt: attempts });
          break; // create a new job in next attempt
        }
      }
    }

    // prepare for next attempt
    if (attempts >= opts.switchAfter) {
      console.log('Switching model after', attempts, 'attempts to fallback model', opts.fallbackModel);
      model = opts.fallbackModel;
    }
  }

  console.error('Exceeded max retries without success. Last job:', lastJob?.id);
  process.exit(1);
}

run().catch((err) => { console.error('Unexpected error:', err instanceof Error ? err.message : String(err)); process.exit(1); });
