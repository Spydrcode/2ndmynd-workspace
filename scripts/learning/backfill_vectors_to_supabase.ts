import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import minimist from "minimist";
import type { VectorDoc } from "../../src/lib/learning/vector_index/vector_types";
import {
  parseVectorDocLine,
  validateVectorDocForSupabase,
  dedupeKey,
  sanitizeEmbeddingModel,
} from "../../src/lib/learning/vector_index/backfill_utils";

const SUPABASE_DIM = 1536;
const DEFAULT_BATCH = 100;
const DEFAULT_CONCURRENCY = 1;

type Counters = {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return { url, key };
}

function formatIn(values: string[]) {
  const escaped = values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`);
  return `in.(${escaped.join(",")})`;
}

async function fetchExistingKeys(url: string, key: string, model: string, runIds: string[]) {
  if (runIds.length === 0) return new Set<string>();
  const params = new URLSearchParams();
  params.set("select", "run_id,embedding_model");
  params.set("embedding_model", `eq.${model}`);
  params.set("run_id", formatIn(runIds));
  const response = await fetch(`${url}/rest/v1/learning_vectors?${params.toString()}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase select failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as Array<{ run_id: string }>;
  return new Set(data.map((row) => row.run_id));
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, retries = 3) {
  let attempt = 0;
  while (true) {
    const response = await fetch(input, init);
    if (response.status < 500 && response.status !== 429) return response;
    if (attempt >= retries) return response;
    const delay = Math.pow(2, attempt) * 500;
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt += 1;
  }
}

async function upsertBatch(docs: VectorDoc[], dryRun: boolean, counters: Counters) {
  if (docs.length === 0) return;
  const { url, key } = getSupabaseConfig();

  const byModel = new Map<string, VectorDoc[]>();
  docs.forEach((doc) => {
    const list = byModel.get(doc.embedding_model) ?? [];
    list.push(doc);
    byModel.set(doc.embedding_model, list);
  });

  for (const [model, batchDocs] of byModel.entries()) {
    const runIds = batchDocs.map((doc) => doc.run_id);
    const existing = await fetchExistingKeys(url, key, model, runIds);
    batchDocs.forEach((doc) => {
      if (existing.has(doc.run_id)) counters.updated += 1;
      else counters.inserted += 1;
    });

    if (dryRun) continue;

    const payload = batchDocs.map((doc) => ({
      id: doc.id || undefined,
      run_id: doc.run_id,
      source: doc.source,
      industry_key: doc.industry_key,
      created_at: doc.created_at,
      embedding_model: doc.embedding_model,
      embedding_dim: doc.embedding_dim ?? doc.embedding.length,
      embedding: doc.embedding,
      metadata: doc.metadata ?? {},
      summary: doc.summary,
    }));

    const response = await fetchWithRetry(
      `${url}/rest/v1/learning_vectors?on_conflict=run_id,embedding_model`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(payload),
      }
    );
    if (!response.ok) {
      counters.failed += batchDocs.length;
      const text = await response.text();
      throw new Error(`Supabase upsert failed: ${response.status} ${text}`);
    }
  }
}

type Checkpoint = {
  filepath: string;
  last_line: number;
  last_id: string | null;
  updated_at: string;
};

function loadCheckpoint(checkpointPath: string): Checkpoint | null {
  if (!fs.existsSync(checkpointPath)) return null;
  const raw = fs.readFileSync(checkpointPath, "utf-8");
  return JSON.parse(raw) as Checkpoint;
}

function saveCheckpoint(checkpointPath: string, checkpoint: Checkpoint) {
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

async function verifyKeys(
  keysByModel: Map<string, Set<string>>,
  counters: Counters
): Promise<{ missing: number; missing_sample: string[] }> {
  const { url, key } = getSupabaseConfig();
  let missing = 0;
  const sample: string[] = [];
  for (const [model, runIdsSet] of keysByModel.entries()) {
    const runIds = Array.from(runIdsSet);
    for (let i = 0; i < runIds.length; i += 200) {
      const slice = runIds.slice(i, i + 200);
      const existing = await fetchExistingKeys(url, key, model, slice);
      slice.forEach((runId) => {
        if (!existing.has(runId)) {
          missing += 1;
          if (sample.length < 20) sample.push(`${runId}::${model}`);
        }
      });
    }
  }
  return { missing, missing_sample: sample };
}

async function run() {
  const args = minimist(process.argv.slice(2));
  const filePath = args.file ?? path.join(process.cwd(), "runs", "learning", "vector_index.jsonl");
  const dryRun = args["dry-run"] === true || args.dryRun === true;
  const limit = args.limit ? Number(args.limit) : undefined;
  const since = args.since ? new Date(String(args.since)) : null;
  const sourceFilter = args.source ?? "all";
  const industryFilter = args.industry ?? "all";
  const modelFilter = args.model ? String(args.model) : null;
  const strict = args.strict === true;
  const verify = args.verify === true;
  const resume = args.resume === true;
  const checkpointPath =
    args.checkpoint ?? path.join(process.cwd(), "runs", "learning", "backfill.checkpoint.json");
  const batchSize = args["batch-size"] ? Number(args["batch-size"]) : args.batch ? Number(args.batch) : DEFAULT_BATCH;
  const concurrency = args.concurrency ? Number(args.concurrency) : DEFAULT_CONCURRENCY;

  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error("Invalid --batch-size. Must be a positive number.");
  }
  if (!Number.isFinite(concurrency) || concurrency <= 0) {
    throw new Error("Invalid --concurrency. Must be a positive number.");
  }

  if (since && Number.isNaN(since.getTime())) {
    throw new Error("Invalid --since date. Use YYYY-MM-DD.");
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const counters: Counters = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  const stream = fs.createReadStream(filePath, "utf-8");
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const docs: VectorDoc[] = [];
  const defaultModel = sanitizeEmbeddingModel(modelFilter ?? undefined);
  const seen = new Set<string>();
  const keysByModel = new Map<string, Set<string>>();
  const pending = new Set<Promise<void>>();
  const batchInfos: Array<{ endLine: number; endId: string | null }> = [];
  const completedBatches = new Set<number>();
  let batchIndex = 0;
  let nextCheckpointBatch = 0;
  let lastCheckpointLine = 0;
  let lastCheckpointId: string | null = null;

  let resumeFromLine = 0;
  if (resume) {
    const checkpoint = loadCheckpoint(checkpointPath);
    if (!checkpoint) {
      throw new Error("Checkpoint not found. Provide --checkpoint or remove --resume.");
    }
    if (checkpoint.filepath !== filePath) {
      throw new Error("Checkpoint file path does not match input file.");
    }
    resumeFromLine = checkpoint.last_line ?? 0;
    lastCheckpointLine = resumeFromLine;
    lastCheckpointId = checkpoint.last_id ?? null;
  }

  const enqueueBatch = async (batch: VectorDoc[], endLine: number, endId: string | null) => {
    const index = batchIndex;
    batchInfos[index] = { endLine, endId };
    batchIndex += 1;
    const promise = (async () => {
      await upsertBatch(batch, dryRun, counters);
      if (verify) return;
      completedBatches.add(index);
      while (completedBatches.has(nextCheckpointBatch)) {
        const info = batchInfos[nextCheckpointBatch];
        if (info.endLine > lastCheckpointLine) {
          lastCheckpointLine = info.endLine;
          lastCheckpointId = info.endId;
          saveCheckpoint(checkpointPath, {
            filepath: filePath,
            last_line: lastCheckpointLine,
            last_id: lastCheckpointId,
            updated_at: new Date().toISOString(),
          });
        }
        completedBatches.delete(nextCheckpointBatch);
        nextCheckpointBatch += 1;
      }
    })();
    pending.add(promise);
    promise.finally(() => pending.delete(promise));
    if (pending.size >= concurrency) {
      await Promise.race(pending);
    }
  };

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    if (lineNumber <= resumeFromLine) continue;
    if (limit && counters.processed >= limit) break;
    const parsed = parseVectorDocLine(line, defaultModel);
    if (!parsed) continue;
    const { doc, removedMetadataKeys } = parsed;
    counters.processed += 1;

    if (sourceFilter !== "all" && doc.source !== sourceFilter) {
      counters.skipped += 1;
      continue;
    }
    if (industryFilter !== "all" && doc.industry_key !== industryFilter) {
      counters.skipped += 1;
      continue;
    }
    if (modelFilter && doc.embedding_model !== modelFilter) {
      counters.skipped += 1;
      continue;
    }
    if (since && new Date(doc.created_at) < since) {
      counters.skipped += 1;
      continue;
    }

    doc.embedding_dim = doc.embedding_dim || doc.embedding.length;
    const errors = validateVectorDocForSupabase(doc, removedMetadataKeys, SUPABASE_DIM);
    if (errors.length > 0) {
      if (strict) {
        throw new Error(`Invalid row at line ${lineNumber}: ${errors.join(", ")}`);
      }
      counters.failed += 1;
      continue;
    }

    const key = dedupeKey(doc);
    if (seen.has(key)) {
      counters.skipped += 1;
      continue;
    }
    seen.add(key);

    if (verify) {
      const set = keysByModel.get(doc.embedding_model) ?? new Set<string>();
      set.add(doc.run_id);
      keysByModel.set(doc.embedding_model, set);
      continue;
    }

    docs.push(doc);
    if (docs.length >= batchSize) {
      const batch = docs.splice(0, docs.length);
      const lastDoc = batch[batch.length - 1];
      await enqueueBatch(batch, lineNumber, lastDoc?.id ?? null);
    }
  }

  if (!verify && docs.length > 0) {
    const lastDoc = docs[docs.length - 1];
    await enqueueBatch(docs, lineNumber, lastDoc?.id ?? null);
  }

  if (!verify && pending.size > 0) {
    await Promise.all(pending);
  }

  if (verify) {
    const verifyResult = await verifyKeys(keysByModel, counters);
    console.log(
      JSON.stringify(
        { ok: true, mode: "verify", file: filePath, dryRun, ...counters, ...verifyResult },
        null,
        2
      )
    );
    return;
  }

  console.log(JSON.stringify({ ok: true, file: filePath, dryRun, ...counters }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
