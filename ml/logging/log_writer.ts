import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import type { LLMLogRecord } from "./log_types";
import { assertValid, validateLLMLogRecord } from "../schemas/validators";

export type LogWriterConfig = {
  dbPath?: string;
  logDir?: string;
};

function getDefaultDbPath() {
  return process.env.ML_LOG_DB_PATH ?? path.join(process.cwd(), "ml", "logs", "llm_logs.db");
}

function getDefaultLogDir() {
  return process.env.ML_LOG_DIR ?? path.join(process.cwd(), "ml", "logs");
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function initDb(dbPath: string) {
  ensureDir(path.dirname(dbPath));
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      environment TEXT NOT NULL,
      record_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_llm_logs_ts ON llm_logs(timestamp);
  `);
  return db;
}

export class LogWriter {
  private db: Database.Database;
  private logDir: string;

  constructor(config: LogWriterConfig = {}) {
    const dbPath = config.dbPath ?? getDefaultDbPath();
    this.db = initDb(dbPath);
    this.logDir = config.logDir ?? getDefaultLogDir();
    ensureDir(this.logDir);
  }

  write(record: LLMLogRecord): void {
    assertValid(validateLLMLogRecord, record, "LLMLogRecord");
    const stmt = this.db.prepare(
      "INSERT INTO llm_logs (id, timestamp, environment, record_json) VALUES (?, ?, ?, ?)"
    );
    stmt.run(record.id, record.timestamp, record.environment, JSON.stringify(record));

    const dateKey = record.timestamp.slice(0, 10);
    const logPath = path.join(this.logDir, `${dateKey}.jsonl`);
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
  }

  close(): void {
    this.db.close();
  }
}
