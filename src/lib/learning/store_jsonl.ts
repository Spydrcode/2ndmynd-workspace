import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import type { DatasetFilters, TrainingExampleV1 } from "./types";

function getStoreRoot() {
  return process.env.LEARNING_STORE_ROOT ?? path.join(process.cwd(), "runs", "learning");
}

function getExamplesPath() {
  return path.join(getStoreRoot(), "examples.jsonl");
}

function getLabelsDir() {
  return path.join(getStoreRoot(), "labels");
}

function ensureStoreDir() {
  fs.mkdirSync(getStoreRoot(), { recursive: true });
}

function readLabels(id: string): TrainingExampleV1["labels"] | undefined {
  const labelsPath = path.join(getLabelsDir(), `${id}.json`);
  if (!fs.existsSync(labelsPath)) return undefined;
  const raw = fs.readFileSync(labelsPath, "utf-8");
  return JSON.parse(raw);
}

function passesFilters(example: TrainingExampleV1, filters: DatasetFilters) {
  if (filters.source && example.source !== filters.source) return false;
  if (filters.industry_key && example.industry_key !== filters.industry_key) return false;
  if (filters.run_id && example.run_id !== filters.run_id) return false;
  if (filters.since) {
    const since = new Date(filters.since);
    const created = new Date(example.created_at);
    if (Number.isFinite(since.getTime()) && Number.isFinite(created.getTime())) {
      if (created < since) return false;
    }
  }
  return true;
}

export function appendExample(example: TrainingExampleV1): void {
  ensureStoreDir();
  const line = JSON.stringify(example);
  fs.appendFileSync(getExamplesPath(), `${line}\n`);
}

export async function listExamples(filters: DatasetFilters = {}): Promise<TrainingExampleV1[]> {
  const filePath = getExamplesPath();
  if (!fs.existsSync(filePath)) return [];
  const examples: TrainingExampleV1[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as TrainingExampleV1;
    const labels = readLabels(parsed.id);
    if (labels) parsed.labels = labels;
    if (filters.has_labels !== undefined) {
      if (filters.has_labels && !parsed.labels) continue;
      if (!filters.has_labels && parsed.labels) continue;
    }
    if (!passesFilters(parsed, filters)) continue;
    examples.push(parsed);
  }
  return examples;
}

export async function exportDataset(params: {
  outPath: string;
  filters?: DatasetFilters;
}): Promise<{ count: number; outPath: string }> {
  const examples = await listExamples(params.filters ?? {});
  fs.mkdirSync(path.dirname(params.outPath), { recursive: true });
  const lines = examples.map((ex) => JSON.stringify(ex)).join("\n");
  fs.writeFileSync(params.outPath, lines ? `${lines}\n` : "");
  return { count: examples.length, outPath: params.outPath };
}

export function updateLabels(id: string, labels: TrainingExampleV1["labels"]): void {
  fs.mkdirSync(getLabelsDir(), { recursive: true });
  const labelsPath = path.join(getLabelsDir(), `${id}.json`);
  fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 2));
}
