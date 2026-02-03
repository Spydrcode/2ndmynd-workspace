import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import type { RagDoc, RagChunk } from "./types";
import { assertValid, validateRagDoc } from "../schemas/validators";

function getDbPath() {
  return process.env.ML_RAG_DB_PATH ?? path.join(process.cwd(), "ml", "rag", "rag.db");
}

function ensureDir() {
  fs.mkdirSync(path.dirname(getDbPath()), { recursive: true });
}

function initDb() {
  ensureDir();
  const db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_docs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      business_id TEXT,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      metadata TEXT,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rag_workspace ON rag_docs(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_rag_business ON rag_docs(business_id);
  `);
  return db;
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function upsertDocs(docs: RagDoc[]): void {
  if (docs.length === 0) return;
  const db = initDb();
  const stmt = db.prepare(
    `INSERT INTO rag_docs (id, workspace_id, business_id, content, source, metadata, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content=excluded.content,
       metadata=excluded.metadata,
       embedding=excluded.embedding,
       created_at=excluded.created_at`
  );
  for (const doc of docs) {
    assertValid(validateRagDoc, doc, "RagDoc");
    if (!doc.embedding || doc.embedding.length === 0) {
      throw new Error("Missing embedding for RagDoc");
    }
    stmt.run(
      doc.id,
      doc.workspace_id,
      doc.business_id ?? null,
      doc.content,
      doc.source,
      JSON.stringify(doc.metadata ?? {}),
      JSON.stringify(doc.embedding),
      doc.created_at
    );
  }
  db.close();
}

export function querySimilar(params: {
  embedding: number[];
  workspace_id: string;
  business_id?: string;
  top_k?: number;
}): RagChunk[] {
  const db = initDb();
  const rows = db
    .prepare(
      `SELECT id, workspace_id, business_id, content, source, embedding FROM rag_docs WHERE workspace_id = ? ${
        params.business_id ? "AND business_id = ?" : ""
      }`
    )
    .all(params.workspace_id, ...(params.business_id ? [params.business_id] : [])) as Array<{
    id: string;
    workspace_id: string;
    business_id?: string | null;
    content: string;
    source: string;
    embedding: string;
  }>;
  db.close();

  const scored = rows.map((row) => {
    const embedding = JSON.parse(row.embedding) as number[];
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      business_id: row.business_id ?? undefined,
      content: row.content,
      source: row.source,
      score: cosineSimilarity(params.embedding, embedding),
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, params.top_k ?? 5);
}

export function clearStore() {
  const db = initDb();
  db.exec("DELETE FROM rag_docs");
  db.close();
}
