/**
 * Learning Layer - Storage
 * 
 * SQLite-based storage for training examples
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import type { TrainingExampleV1, DatasetFilters } from "./types";

const DB_PATH = path.join(process.cwd(), "runs", "learning.db");

/**
 * Get or create database connection
 */
function getDatabase(): Database.Database {
  // Ensure directory exists
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  
  const db = new Database(DB_PATH);
  
  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");
  
  // Initialize schema if needed
  initializeSchema(db);
  
  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS training_examples (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      run_id TEXT NOT NULL,
      source TEXT NOT NULL,
      industry_key TEXT,
      feature_schema TEXT NOT NULL,
      pipeline_version TEXT NOT NULL,
      generator_version TEXT,
      features TEXT NOT NULL,
      targets TEXT NOT NULL,
      labels TEXT,
      indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_created_at ON training_examples(created_at);
    CREATE INDEX IF NOT EXISTS idx_source ON training_examples(source);
    CREATE INDEX IF NOT EXISTS idx_industry_key ON training_examples(industry_key);
    CREATE INDEX IF NOT EXISTS idx_run_id ON training_examples(run_id);
  `);
}

/**
 * Insert a training example
 */
export function insertExample(example: TrainingExampleV1): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    INSERT INTO training_examples (
      id, created_at, run_id, source, industry_key,
      feature_schema, pipeline_version, generator_version,
      features, targets, labels
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    example.id,
    example.created_at,
    example.run_id,
    example.source,
    example.industry_key ?? null,
    example.feature_schema,
    example.pipeline_version,
    example.generator_version ?? null,
    JSON.stringify(example.features),
    JSON.stringify(example.targets),
    example.labels ? JSON.stringify(example.labels) : null
  );
  
  db.close();
}

/**
 * List training examples with filters
 */
export function listExamples(filters: DatasetFilters = {}): TrainingExampleV1[] {
  const db = getDatabase();
  
  let query = "SELECT * FROM training_examples WHERE 1=1";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [];
  
  if (filters.source) {
    query += " AND source = ?";
    params.push(filters.source);
  }
  
  if (filters.industry_key) {
    query += " AND industry_key = ?";
    params.push(filters.industry_key);
  }

  if (filters.run_id) {
    query += " AND run_id = ?";
    params.push(filters.run_id);
  }

  if (filters.since) {
    query += " AND created_at >= ?";
    params.push(filters.since);
  }
  
  if (filters.has_labels !== undefined) {
    query += filters.has_labels ? " AND labels IS NOT NULL" : " AND labels IS NULL";
  }
  
  query += " ORDER BY created_at DESC";
  
  const stmt = db.prepare(query);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = stmt.all(...params) as any[];
  
  db.close();
  
  return rows.map(rowToExample);
}

/**
 * Get a single example by ID
 */
export function getExample(id: string): TrainingExampleV1 | null {
  const db = getDatabase();
  
  const stmt = db.prepare("SELECT * FROM training_examples WHERE id = ?");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = stmt.get(id) as any;
  
  db.close();
  
  return row ? rowToExample(row) : null;
}

/**
 * Update labels for an example
 */
export function updateLabels(id: string, labels: TrainingExampleV1["labels"]): void {
  const db = getDatabase();
  
  const stmt = db.prepare("UPDATE training_examples SET labels = ? WHERE id = ?");
  stmt.run(JSON.stringify(labels), id);
  
  db.close();
}

/**
 * Export dataset to JSONL file
 */
export function exportDataset(outputPath: string, filters: DatasetFilters = {}): number {
  const examples = listExamples(filters);
  
  // Ensure directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  
  // Write JSONL (one JSON object per line)
  const lines = examples.map((ex) => JSON.stringify(ex));
  fs.writeFileSync(outputPath, lines.join("\n"));
  
  return examples.length;
}

/**
 * Get dataset statistics
 */
export function getStatistics(): {
  total_count: number;
  mock_count: number;
  real_count: number;
  labeled_count: number;
  industries: Record<string, number>;
  earliest_date: string | null;
  latest_date: string | null;
} {
  const db = getDatabase();
  
  const total = db.prepare("SELECT COUNT(*) as count FROM training_examples").get() as { count: number };
  const mock = db.prepare("SELECT COUNT(*) as count FROM training_examples WHERE source = 'mock'").get() as { count: number };
  const real = db.prepare("SELECT COUNT(*) as count FROM training_examples WHERE source = 'real'").get() as { count: number };
  const labeled = db.prepare("SELECT COUNT(*) as count FROM training_examples WHERE labels IS NOT NULL").get() as { count: number };
  
  const industryRows = db.prepare("SELECT industry_key, COUNT(*) as count FROM training_examples WHERE industry_key IS NOT NULL GROUP BY industry_key").all() as Array<{ industry_key: string; count: number }>;
  const industries: Record<string, number> = {};
  for (const row of industryRows) {
    industries[row.industry_key] = row.count;
  }
  
  const dates = db.prepare("SELECT MIN(created_at) as earliest, MAX(created_at) as latest FROM training_examples").get() as { earliest: string | null; latest: string | null };
  
  db.close();
  
  return {
    total_count: total.count,
    mock_count: mock.count,
    real_count: real.count,
    labeled_count: labeled.count,
    industries,
    earliest_date: dates.earliest,
    latest_date: dates.latest,
  };
}

/**
 * Convert database row to TrainingExampleV1
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToExample(row: any): TrainingExampleV1 {
  return {
    id: row.id,
    created_at: row.created_at,
    run_id: row.run_id,
    source: row.source,
    industry_key: row.industry_key,
    feature_schema: row.feature_schema,
    pipeline_version: row.pipeline_version,
    generator_version: row.generator_version,
    features: JSON.parse(row.features),
    targets: JSON.parse(row.targets),
    labels: row.labels ? JSON.parse(row.labels) : undefined,
  };
}
