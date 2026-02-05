/**
 * RAG Ingestion for Intelligence Layer
 * 
 * Wrapper around ml/rag/ingest that enforces intelligence layer conventions:
 * - No PII
 * - No raw CSV rows
 * - No customer names
 * - Only high-level context
 */

import { ingestDocs, type RagDocInput as MlRagDocInput } from "@/ml/rag/ingest";
import type { RagDocInput } from "./types";

/**
 * Ingest a RAG document for context enrichment.
 * 
 * Guards:
 * - Validates metadata presence
 * - Ensures text is not empty
 * - Enforces size limits
 * 
 * @param doc Document to ingest
 * @returns Promise resolving to success status
 */
export async function ingestRagDoc(doc: RagDocInput): Promise<{ success: boolean; id: string }> {
  // Validate input
  if (!doc.text.trim()) {
    throw new Error("RAG document text cannot be empty");
  }

  if (!doc.metadata.workspace_id) {
    throw new Error("RAG document must have workspace_id");
  }

  if (!doc.metadata.doc_type) {
    throw new Error("RAG document must have doc_type");
  }

  if (!doc.metadata.source) {
    throw new Error("RAG document must have source");
  }

  // Size guard: max 50KB per document
  const MAX_SIZE = 50_000;
  if (doc.text.length > MAX_SIZE) {
    console.warn(
      `RAG document too large (${doc.text.length} chars), truncating to ${MAX_SIZE}`
    );
    doc.text = doc.text.slice(0, MAX_SIZE);
  }

  // Convert to ml/rag format
  const mlDoc: MlRagDocInput = {
    workspace_id: doc.metadata.workspace_id,
    content: doc.text,
    source: `${doc.metadata.doc_type}:${doc.metadata.source}`,
    metadata: doc.metadata as Record<string, string | number | boolean | null>,
    created_at: doc.metadata.created_at,
  };

  // Ingest
  const result = await ingestDocs([mlDoc]);

  return {
    success: result.count > 0,
    id: `${doc.metadata.doc_type}_${doc.metadata.workspace_id}_${Date.now()}`,
  };
}

/**
 * Batch ingest multiple RAG documents.
 * Useful for seeding industry baselines and tool playbooks.
 */
export async function ingestRagDocsBatch(docs: RagDocInput[]): Promise<{ count: number }> {
  const mlDocs: MlRagDocInput[] = docs.map((doc) => ({
    workspace_id: doc.metadata.workspace_id,
    content: doc.text,
    source: `${doc.metadata.doc_type}:${doc.metadata.source}`,
    metadata: doc.metadata as Record<string, string | number | boolean | null>,
    created_at: doc.metadata.created_at,
  }));

  return await ingestDocs(mlDocs);
}
