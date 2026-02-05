import crypto from "node:crypto";

export type RunContext = {
  run_id: string;
  input_hash: string;
  snapshot_version: string;
  model_id: string;
  source: string;
  created_at: string;
  started_at: string;
  finished_at?: string;
  tags?: string[];
};

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(",")}}`;
}

export function hashInput(value: unknown): string {
  const hash = crypto.createHash("sha256");
  hash.update(stableStringify(value));
  return hash.digest("hex");
}

export function createRunContext(params: {
  input: unknown;
  snapshot_version: string;
  model_id: string;
  source: string;
  tags?: string[];
}): RunContext {
  const now = new Date().toISOString();
  return {
    run_id: crypto.randomUUID(),
    input_hash: hashInput(params.input),
    snapshot_version: params.snapshot_version,
    model_id: params.model_id,
    source: params.source,
    created_at: now,
    started_at: now,
    tags: params.tags ?? [],
  };
}

export function finalizeRunContext<T extends RunContext>(ctx: T): T {
  return { ...ctx, finished_at: new Date().toISOString() };
}
