import fs from "node:fs/promises";
import path from "node:path";

export const RUNS_DIR = path.join(process.cwd(), "runs", "snapshot");

export function ensureRunDir(runId: string) {
  return fs.mkdir(path.join(RUNS_DIR, runId), { recursive: true });
}

function runPath(runId: string, filename: string) {
  return path.join(RUNS_DIR, runId, filename);
}

export async function writeJSON(runId: string, filename: string, obj: unknown) {
  await ensureRunDir(runId);
  await fs.writeFile(runPath(runId, filename), JSON.stringify(obj, null, 2), "utf8");
}

export async function readJSON<T = unknown>(runId: string, filename: string): Promise<T> {
  const raw = await fs.readFile(runPath(runId, filename), "utf8");
  return JSON.parse(raw) as T;
}

export async function deleteFile(runId: string, filename: string) {
  try {
    await fs.unlink(runPath(runId, filename));
  } catch {
    // ignore
  }
}

export async function runExists(runId: string) {
  try {
    await fs.access(path.join(RUNS_DIR, runId));
    return true;
  } catch {
    return false;
  }
}

export async function writeBuffer(runId: string, filename: string, buffer: Buffer) {
  await ensureRunDir(runId);
  await fs.writeFile(runPath(runId, filename), buffer);
}

export async function readBuffer(runId: string, filename: string) {
  return fs.readFile(runPath(runId, filename));
}

