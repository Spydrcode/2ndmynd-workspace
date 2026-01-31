import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type RunLogEvent = {
  ts: string;
  run_id: string;
  type: string;
  duration_ms?: number;
  [key: string]: unknown;
};

export class RunLogger {
  run_id: string;
  log_path: string;

  constructor(run_id?: string) {
    this.run_id = run_id ?? crypto.randomUUID();
    this.log_path = path.resolve("runs", `${this.run_id}.jsonl`);
  }

  logEvent(type: string, payload: Record<string, unknown> = {}) {
    const record: RunLogEvent = {
      ts: new Date().toISOString(),
      run_id: this.run_id,
      type,
      ...payload,
    };
    fs.mkdirSync(path.dirname(this.log_path), { recursive: true });
    fs.appendFileSync(this.log_path, `${JSON.stringify(record)}\n`);
    return record;
  }

  startTimer() {
    const start = Date.now();
    return () => Date.now() - start;
  }

  logDuration(type: string, startMs: number, payload: Record<string, unknown> = {}) {
    const duration_ms = Date.now() - startMs;
    return this.logEvent(type, { ...payload, duration_ms });
  }

  static serializeError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      };
    }
    return { name: "Error", message: String(error) };
  }
}
