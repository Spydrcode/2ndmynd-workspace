import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

type Opts = {
  trainingFilePath?: string | null;
  baseModel: string;
  fallbackModel: string;
  stallMinutes: number;
  maxRetries: number;
  switchAfter: number;
  pollSeconds: number;
  outDir: string;
};

const env = process.env;
const opts: Opts = {
  trainingFilePath: env.FT_TRAINING_FILE || null,
  // prefer snapshoted stable model id; override with FT_BASE_MODEL if needed
  baseModel: env.FT_BASE_MODEL || 'gpt-4.1-mini-2025-04-14',
  fallbackModel: env.FT_FALLBACK_MODEL || 'gpt-4o-mini-2024-07-18',
  stallMinutes: Number(env.FT_STALL_MINUTES ?? env.FT_WATCHDOG_MINUTES ?? 15),
  maxRetries: Number(env.FT_MAX_RETRIES ?? 6),
  switchAfter: Number(env.FT_SWITCH_AFTER ?? 3),
  pollSeconds: Number(env.FT_POLL_SECONDS ?? 30),
  outDir: env.FT_OUT_DIR || 'ml_artifacts',
};

// Build the ordered list of model candidates. Comma-separated env overrides allow
// trying snapshoted IDs first, then fallbacks.
const rawCandidates = (env.FT_MODEL_CANDIDATES || `${opts.baseModel},${opts.fallbackModel}`).split(',').map(s => s.trim()).filter(Boolean);
const modelCandidates = Array.from(new Set(rawCandidates));

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ARTIFACT_DIR = path.resolve(process.cwd(), opts.outDir);
const LATEST = path.join(ARTIFACT_DIR, 'latest_finetune_job.json');
const LOG = path.join(ARTIFACT_DIR, 'finetune_watchdog_log.jsonl');

function appendLog(obj: unknown) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.appendFileSync(LOG, JSON.stringify(obj) + '\n');
  } catch (e) {
    console.error('Failed to append log', e);
  }
}

function writeLatest(obj: unknown) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(LATEST, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Failed to write latest artifact', e);
  }
}

async function chooseFile(): Promise<string> {
  const repaired = path.resolve('tmp/train_v2_repaired.jsonl');
  const quarantined = path.resolve('tmp/train_v2_quarantined.jsonl');

  if (opts.trainingFilePath && fs.existsSync(opts.trainingFilePath)) return opts.trainingFilePath;
  if (fs.existsSync(repaired)) return repaired;
  if (fs.existsSync(quarantined)) {
    const count = fs.readFileSync(quarantined, 'utf8').split(/\r?\n/).filter(Boolean).length;
    if (count >= 20) return quarantined;
  }
  throw new Error('No acceptable training file found. Provide path or place repaired/quarantined file in tmp/.');
}

async function uploadIfNeeded(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  if (/^file-/.test(filePath) || /^flr-/.test(filePath)) return filePath;
  const upload = await client.files.create({ file: fs.createReadStream(filePath), purpose: 'fine-tune' });
  appendLog({ type: 'upload', ts: Date.now(), file: filePath, upload_id: upload.id });
  return upload.id;
}

async function createJob(model: string, training_file_id: string | null, suffix: string) {
  const job = await client.fineTuning.jobs.create({ model, training_file: training_file_id ?? undefined, suffix });
  const entry = { job_id: job.id, model, training_file: training_file_id, created_at: job.created_at, status: job.status } as const;
  writeLatest(entry);
  appendLog({ type: 'create', ts: Date.now(), ...entry });
  return job;
}

async function listLastEventAt(jobId: string): Promise<number | null> {
  try {
    const events = await client.fineTuning.jobs.listEvents(jobId, { limit: 200 });
    if (!events || !events.data || events.data.length === 0) return null;
    const last = events.data.reduce((acc, e) => Math.max(acc, Number(e.created_at || 0)), 0);
    return last;
  } catch (e) {
    return null;
  }
}

async function retrieveJob(jobId: string) {
  return client.fineTuning.jobs.retrieve(jobId);
}

async function cancelJob(jobId: string) {
  try {
    const canceled = await client.fineTuning.jobs.cancel(jobId);
    appendLog({ type: 'cancel', ts: Date.now(), job_id: jobId, status: canceled.status });
    return canceled;
  } catch (e) {
    appendLog({ type: 'cancel_error', ts: Date.now(), job_id: jobId, error: String(e) });
    throw e;
  }
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  const filePath = await chooseFile();
  const trainingFileId = await uploadIfNeeded(filePath);

  let attempts = 0;
  let model = opts.baseModel;
  let lastJob: any = null;

  while (attempts < opts.maxRetries) {
    attempts += 1;
    const suffix = `2ndmynd-watchdog-${Date.now()}-a${attempts}`;
    // Try model candidates in order until a create succeeds or we exhaust the list
    let job: any = null;
    for (const candidate of modelCandidates) {
      console.log('Attempt', attempts, '- trying model candidate', candidate);
      try {
        job = await createJob(candidate, trainingFileId, suffix);
        console.log('Job created with model candidate', candidate);
        break;
      } catch (err: any) {
        const msg = String(err?.message || err);
        // If it's a 400 about model not available / does not exist, continue to next candidate
        const isModelUnavailable = msg.toLowerCase().includes('not available') || msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('model') && msg.toLowerCase().includes('not');
        if (isModelUnavailable) {
          appendLog({ type: 'model_unavailable', ts: Date.now(), candidate, error: msg });
          console.warn('Model candidate not available:', candidate, '-', msg);
          continue;
        }
        // other errors bubble up
        throw err;
      }
    }

    if (!job) {
      console.error('All model candidates failed to create a job for attempt', attempts);
      // treat as a failed attempt and proceed to next retry loop (which may switch models)
      lastJob = null;
      // fallthrough to attempt counter and possible model switch
      // but pause a bit to avoid immediate retry storm
      await sleep(5000);
      if (attempts >= opts.switchAfter) {
        // rotate candidates by putting first at end
        modelCandidates.push(modelCandidates.shift()!);
      }
      continue;
    }
    lastJob = job;

    const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
    let lastEventAt = (await listLastEventAt(job.id)) || job.created_at || Math.floor(Date.now() / 1000);
    writeLatest({ job_id: job.id, model, created_at: job.created_at, last_event_at: lastEventAt, status: job.status, trained_tokens: (job as any).trained_tokens ?? null });

    while (true) {
      await sleep(opts.pollSeconds * 1000);
      const j = await retrieveJob(job.id);
      const eventsAt = await listLastEventAt(job.id);
      if (eventsAt) lastEventAt = Math.max(lastEventAt, eventsAt);

      const entry = { job_id: j.id, model, created_at: j.created_at, last_event_at: lastEventAt, status: j.status, trained_tokens: (j as any).trained_tokens ?? null };
      writeLatest(entry);
      appendLog({ type: 'status', ts: Date.now(), ...entry, attempt: attempts });

      const nowSec = Math.floor(Date.now() / 1000);

      if (TERMINAL.has(j.status)) {
        console.log('Job reached terminal status:', j.status);
        if (j.status === 'succeeded') return j;
        break;
      }

      if (j.status === 'running' && ((j as any).trained_tokens === null || (j as any).trained_tokens === undefined)) {
        const idleSec = nowSec - (lastEventAt || j.created_at || nowSec);
        if (idleSec > opts.stallMinutes * 60) {
          console.warn(`Watchdog triggered: idle ${idleSec}s > ${opts.stallMinutes}m for job ${j.id}`);
          await cancelJob(j.id);
          appendLog({ type: 'watchdog_cancel', ts: Date.now(), job_id: j.id, idle_sec: idleSec, attempt: attempts });
          break;
        }
      }
    }

    if (attempts >= opts.switchAfter) {
      console.log('Switching model after', attempts, 'attempts to fallback model', opts.fallbackModel);
      model = opts.fallbackModel;
    }
  }

  console.error('Exceeded max retries without success. Last job:', lastJob?.id);
  process.exit(1);
}

run().catch((err) => { console.error('Unexpected error:', err instanceof Error ? err.message : String(err)); process.exit(1); });
