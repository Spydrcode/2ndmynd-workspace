import * as fs from "fs";
import * as path from "path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { LLMLogRecord, TrainExample } from "../logging/log_types";
import { assertValid, validateTrainExample } from "../schemas/validators";
import { dedupeExamples } from "./dedupe";
import { isCorrected, isHighImpact, isPIIHeavy } from "./quality_checks";
import { seededShuffle, sampleTop } from "./sampling";
import { buildTrainExample } from "./split";

type ReviewDecision = {
  log_id: string;
  promote_to: "gold" | "growth" | "reject";
  reviewer: string;
  notes: string;
  score: number;
  corrected_output: object;
};

function getLogDbPath() {
  return process.env.ML_LOG_DB_PATH ?? path.join(process.cwd(), "ml", "logs", "llm_logs.db");
}

function getLogsDir() {
  return process.env.ML_LOG_DIR ?? path.join(process.cwd(), "ml", "logs");
}

function loadLogsSince(since: string): LLMLogRecord[] {
  const dbPath = getLogDbPath();
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath);
    const rows = db
      .prepare("SELECT record_json FROM llm_logs WHERE timestamp >= ? ORDER BY timestamp DESC")
      .all(since) as Array<{ record_json: string }>;
    db.close();
    return rows.map((row) => JSON.parse(row.record_json));
  }

  const logsDir = getLogsDir();
  if (!fs.existsSync(logsDir)) return [];
  const files = fs.readdirSync(logsDir).filter((f) => f.endsWith(".jsonl"));
  const records: LLMLogRecord[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(logsDir, file), "utf-8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const record = JSON.parse(line) as LLMLogRecord;
      if (record.timestamp >= since) records.push(record);
    }
  }
  return records;
}

function writeJsonl(filePath: string, entries: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = entries.map((entry) => JSON.stringify(entry)).join("\n");
  fs.writeFileSync(filePath, content ? `${content}\n` : "");
}

function appendJsonl(filePath: string, entries: unknown[]): void {
  if (entries.length === 0) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

function updateManifest(filePath: string, dataPath: string): void {
  const content = fs.existsSync(dataPath) ? fs.readFileSync(dataPath, "utf-8") : "";
  const count = content.trim() ? content.trim().split(/\r?\n/).length : 0;
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const manifest = {
    name: path.basename(path.dirname(filePath)),
    count,
    last_updated: new Date().toISOString(),
    hash,
  };
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
}

function resolveWeekKey(date: Date) {
  const firstJan = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const days = Math.floor((date.getTime() - firstJan.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.floor(days / 7) + 1;
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function curateWeekly() {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const records = loadLogsSince(since);

  const byId = new Map<string, LLMLogRecord>();
  records.forEach((rec) => byId.set(rec.id, rec));

  const candidates = records.filter((rec) => !isPIIHeavy(rec));
  const corrected = candidates.filter(isCorrected);
  const highImpact = candidates.filter(isHighImpact);

  const seed = Number(`${now.getUTCFullYear()}${resolveWeekKey(now).slice(-2)}`);
  const sample = sampleTop(seededShuffle([...new Set([...corrected, ...highImpact])], seed), 50);

  const packetEntries = sample.map((rec) => ({
    log_id: rec.id,
    timestamp: rec.timestamp,
    schema_valid: rec.validations.schema_valid,
    doctrine_score: rec.validations.doctrine_score,
    clarity_score: rec.validations.clarity_score,
    corrected: rec.outcome.corrected,
    correction_reference_id: rec.outcome.correction_reference_id ?? null,
    output_preview: rec.response.output_text.slice(0, 280),
  }));

  const weekKey = resolveWeekKey(now);
  const packetDir = path.join(process.cwd(), "ml", "datasets", "quarantine", "review_packets", weekKey);
  fs.mkdirSync(packetDir, { recursive: true });
  const packetPath = path.join(packetDir, "packet.json");
  fs.writeFileSync(packetPath, JSON.stringify({ week: weekKey, since, count: packetEntries.length, items: packetEntries }, null, 2));

  const decisionsPath = path.join(packetDir, "decisions.json");
  if (fs.existsSync(decisionsPath)) {
    const decisions = JSON.parse(fs.readFileSync(decisionsPath, "utf-8")) as ReviewDecision[];
    const toAdd: TrainExample[] = [];

    for (const decision of decisions) {
      if (decision.promote_to === "reject") continue;
      const original = byId.get(decision.log_id);
      if (!original) continue;
      const example = buildTrainExample({
        record: original,
        corrected_output: decision.corrected_output,
        split: decision.promote_to,
        reviewer: decision.reviewer,
        notes: decision.notes,
        score: decision.score,
      });
      assertValid(validateTrainExample, example, "TrainExample");
      toAdd.push(example);
    }

    const deduped = dedupeExamples(toAdd);
    const gold = deduped.filter((e) => e.split === "gold");
    const growth = deduped.filter((e) => e.split === "growth");

    appendJsonl(path.join(process.cwd(), "ml", "datasets", "gold", "gold.jsonl"), gold);
    appendJsonl(path.join(process.cwd(), "ml", "datasets", "growth", "growth.jsonl"), growth);

    updateManifest(
      path.join(process.cwd(), "ml", "datasets", "gold", "manifest.json"),
      path.join(process.cwd(), "ml", "datasets", "gold", "gold.jsonl")
    );
    updateManifest(
      path.join(process.cwd(), "ml", "datasets", "growth", "manifest.json"),
      path.join(process.cwd(), "ml", "datasets", "growth", "growth.jsonl")
    );
  }

  return {
    total_logs: records.length,
    candidates: candidates.length,
    packet_path: packetPath,
  };
}

if (require.main === module) {
  curateWeekly()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
