import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { buildSnapshotV2, RawInvoice, RawQuote, BuildSnapshotV2Input } from "./lib/snapshot/build_snapshot_v2";
import { SnapshotV2 } from "../../lib/decision/v2/conclusion_schema_v2";
import { hashInput } from "./lib/run_context";

type SnapshotV1 = {
  snapshot_version: "snapshot_v1";
  pii_scrubbed?: boolean;
  signals?: Record<string, unknown>;
  signals_flat?: Record<string, unknown>;
};

type ApiSnapshot = SnapshotV2 | SnapshotV1;

type DatasetPackRow = {
  id?: string;
  source?: string;
  company_id?: string;
  tags?: string[];
  quotes?: RawQuote[];
  invoices?: RawInvoice[];
  input_costs?: BuildSnapshotV2Input["input_costs"];
  report_date?: string;
  lookback_days?: number;
  input_snapshot?: unknown;
  snapshot?: unknown;
  snapshot_v2?: unknown;
};

type RecordLine = {
  run_id: string;
  input_hash: string;
  input_id?: string;
  source?: string;
  company_id?: string;
  tags?: string[];
  snapshot: ApiSnapshot;
  response?: {
    ok: boolean;
    status: number;
    body: unknown;
  };
  error?: { message: string };
  started_at: string;
  finished_at: string;
  duration_ms: number;
};

type Args = {
  input: string;
  api: string;
  out: string;
  limit?: number;
  replay?: string;
  compare?: string;
  allowV1?: boolean;
};

const DEFAULTS: Args = {
  input: "ml_artifacts/valid_decision_v2.jsonl",
  api: "http://localhost:3000/api/decision",
  out: "ml_artifacts/dataset_v2_runs.jsonl",
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--in":
        if (value) args.input = value;
        break;
      case "--api":
        if (value) args.api = value;
        break;
      case "--out":
        if (value) args.out = value;
        break;
      case "--limit":
        if (value) args.limit = Number(value);
        break;
      case "--replay":
        if (value) args.replay = value;
        break;
      case "--compare":
        if (value) args.compare = value;
        break;
      case "--allow_v1":
        args.allowV1 = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function isSnapshotV2(value: unknown): value is SnapshotV2 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { snapshot_version?: unknown };
  return candidate.snapshot_version === "snapshot_v2";
}

function isSnapshotV1(value: unknown): value is SnapshotV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { snapshot_version?: unknown };
  return candidate.snapshot_version === "snapshot_v1";
}

function loadPack(inputPath: string): DatasetPackRow[] {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing input pack: ${resolved}`);
  }

  if (resolved.endsWith(".jsonl")) {
    const lines = fs.readFileSync(resolved, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.map((line) => JSON.parse(line) as DatasetPackRow);
  }

  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) return parsed as DatasetPackRow[];
  if (parsed && typeof parsed === "object") {
    const candidate = parsed as { packs?: DatasetPackRow[] };
    if (Array.isArray(candidate.packs)) return candidate.packs;
  }
  return [parsed as DatasetPackRow];
}

function buildSnapshotFromRow(row: DatasetPackRow, allowV1: boolean): ApiSnapshot {
  const candidate = row.input_snapshot ?? row.snapshot ?? row.snapshot_v2;
  if (isSnapshotV2(candidate)) return candidate;
  if (isSnapshotV1(candidate)) {
    if (allowV1) return candidate;
    throw new Error("snapshot_v1 provided but --allow_v1 not set");
  }

  return buildSnapshotV2({
    quotes: row.quotes ?? [],
    invoices: row.invoices ?? [],
    input_costs: row.input_costs,
    report_date: row.report_date,
    lookback_days: row.lookback_days,
  });
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function callApi(apiUrl: string, snapshot: ApiSnapshot) {
  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input_snapshot: snapshot }),
  });
  const text = await resp.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: resp.ok, status: resp.status, body };
}

function loadRecords(pathStr: string): RecordLine[] {
  const resolved = path.resolve(pathStr);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing record file: ${resolved}`);
  }
  return fs
    .readFileSync(resolved, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RecordLine);
}

function keyForRecord(record: RecordLine) {
  if (record.input_hash) return record.input_hash;
  if (record.input_id) return record.input_id;
  return crypto.createHash("sha256").update(JSON.stringify(record.snapshot)).digest("hex");
}

function extractConclusion(record: RecordLine) {
  const body = record.response?.body as { conclusion?: unknown } | undefined;
  if (!body || typeof body !== "object") return null;
  const candidate = body.conclusion as Record<string, unknown> | undefined;
  if (!candidate || typeof candidate !== "object") return null;
  return {
    decision: typeof candidate.decision === "string" ? candidate.decision : null,
    boundary: typeof candidate.boundary === "string" ? candidate.boundary : null,
    pattern_id: typeof candidate.pattern_id === "string" ? candidate.pattern_id : null,
    why_this_now: typeof candidate.why_this_now === "string" ? candidate.why_this_now : null,
    one_sentence_pattern:
      typeof candidate.one_sentence_pattern === "string"
        ? candidate.one_sentence_pattern
        : null,
  };
}

function compareRecords(base: RecordLine[], next: RecordLine[]) {
  const baseMap = new Map(base.map((rec) => [keyForRecord(rec), rec]));
  const nextMap = new Map(next.map((rec) => [keyForRecord(rec), rec]));

  let compared = 0;
  let missing = 0;
  let decisionSame = 0;
  let boundarySame = 0;
  let patternSame = 0;
  let whySame = 0;
  let sentenceSame = 0;
  let exact = 0;

  for (const [key, baseRec] of baseMap.entries()) {
    const nextRec = nextMap.get(key);
    if (!nextRec) {
      missing += 1;
      continue;
    }
    compared += 1;
    const baseConclusion = extractConclusion(baseRec);
    const nextConclusion = extractConclusion(nextRec);
    if (!baseConclusion || !nextConclusion) continue;

    const decisionOk = baseConclusion.decision === nextConclusion.decision;
    const boundaryOk = baseConclusion.boundary === nextConclusion.boundary;
    const patternOk = baseConclusion.pattern_id === nextConclusion.pattern_id;
    const whyOk = baseConclusion.why_this_now === nextConclusion.why_this_now;
    const sentenceOk =
      baseConclusion.one_sentence_pattern === nextConclusion.one_sentence_pattern;

    if (decisionOk) decisionSame += 1;
    if (boundaryOk) boundarySame += 1;
    if (patternOk) patternSame += 1;
    if (whyOk) whySame += 1;
    if (sentenceOk) sentenceSame += 1;
    if (decisionOk && boundaryOk && patternOk && whyOk && sentenceOk) exact += 1;
  }

  return {
    compared,
    missing,
    decision_same: decisionSame,
    boundary_same: boundarySame,
    pattern_same: patternSame,
    why_this_now_same: whySame,
    one_sentence_pattern_same: sentenceSame,
    exact_match: exact,
  };
}

async function runLive(args: Args) {
  const rows = loadPack(args.input);
  const limit = args.limit ? Math.min(args.limit, rows.length) : rows.length;
  const outPath = path.resolve(args.out);
  ensureDir(outPath);

  const records: RecordLine[] = [];

  for (let i = 0; i < limit; i += 1) {
    const row = rows[i];
    const snapshot = buildSnapshotFromRow(row, Boolean(args.allowV1));
    const startedAt = new Date();

    let response: RecordLine["response"] | undefined;
    let error: RecordLine["error"] | undefined;
    try {
      response = await callApi(args.api, snapshot);
    } catch (err) {
      error = {
        message: err instanceof Error ? err.message : "api_call_failed",
      };
    }

    const finishedAt = new Date();
    const record: RecordLine = {
      run_id: crypto.randomUUID(),
      input_hash: hashInput(row),
      input_id: row.id,
      source: row.source ?? "dataset_pack",
      company_id: row.company_id,
      tags: row.tags ?? [],
      snapshot,
      response,
      error,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
    };

    fs.appendFileSync(outPath, `${JSON.stringify(record)}\n`);
    records.push(record);
  }

  return records;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.replay) {
    const replayRecords = loadRecords(args.replay);
    if (args.compare) {
      const compareRecordsInput = loadRecords(args.compare);
      const summary = compareRecords(compareRecordsInput, replayRecords);
      console.log("Replay compare summary:");
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`Loaded replay records: ${replayRecords.length}`);
    }
    return;
  }

  const records = await runLive(args);
  console.log(`Recorded ${records.length} runs to ${args.out}`);

  if (args.compare) {
    const baseline = loadRecords(args.compare);
    const summary = compareRecords(baseline, records);
    console.log("Compare summary:");
    console.log(JSON.stringify(summary, null, 2));
  }
}

main().catch((error) => {
  console.error("Dataset v2 run failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
