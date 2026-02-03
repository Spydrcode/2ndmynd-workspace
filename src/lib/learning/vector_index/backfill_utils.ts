/* eslint-disable @typescript-eslint/no-explicit-any */
import type { VectorDoc } from "./vector_types";
import { sanitizeMetadata } from "./metadata";

const EMAIL = /@/;
const PHONE = /(\+?\d{1,2}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;

export function sanitizeEmbeddingModel(model?: string) {
  if (typeof model === "string" && model.trim()) return model.trim();
  return process.env.LEARNING_EMBEDDING_MODEL ?? "text-embedding-3-small";
}

export function resolveEmbeddingDim(model: string) {
  if (model === "text-embedding-3-small") return 1536;
  if (model === "text-embedding-3-large") return 3072;
  return 1536;
}

export function hasPii(text: string) {
  return EMAIL.test(text) || PHONE.test(text);
}

export function parseVectorDocLine(
  line: string,
  defaultModel: string
): { doc: VectorDoc; removedMetadataKeys: string[] } | null {
  if (!line.trim()) return null;
  const raw = JSON.parse(line) as Partial<VectorDoc> & Record<string, unknown>;
  const embedding = Array.isArray(raw.embedding) ? raw.embedding.map((v) => Number(v)) : [];
  const embedding_model = sanitizeEmbeddingModel(raw.embedding_model ?? defaultModel);
  const embedding_dim = typeof raw.embedding_dim === "number" ? raw.embedding_dim : embedding.length;
  const metadataRaw = raw.metadata && typeof raw.metadata === "object" ? (raw.metadata as Record<string, unknown>) : {};
  const sanitized = sanitizeMetadata(metadataRaw);
  const metadata = sanitized.clean;
  const source = (raw.source ?? (metadata as any)?.source ?? "mock") as VectorDoc["source"];
  const industry_key = (raw.industry_key ?? (metadata as any)?.industry_key ?? "unknown") as VectorDoc["industry_key"];

  return {
    removedMetadataKeys: sanitized.removedKeys,
    doc: {
      id: typeof raw.id === "string" ? raw.id : "",
      run_id: typeof raw.run_id === "string" ? raw.run_id : String((metadata as any)?.run_id ?? ""),
      source,
      industry_key,
      created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
      embedding_model,
      embedding_dim,
      embedding,
      metadata,
      summary: typeof raw.summary === "string" ? raw.summary : "",
    },
  };
}

export function validateVectorDocForSupabase(
  doc: VectorDoc,
  removedMetadataKeys: string[],
  expectedDim = 1536
): string[] {
  const errors: string[] = [];
  if (!doc.run_id) errors.push("missing_run_id");
  if (!doc.summary) errors.push("missing_summary");
  if (hasPii(doc.summary)) errors.push("summary_contains_pii");
  if (!Array.isArray(doc.embedding) || doc.embedding.length === 0) errors.push("missing_embedding");
  const dim = doc.embedding_dim || doc.embedding.length;
  if (dim !== expectedDim) errors.push("embedding_dim_mismatch");
  if (!doc.embedding_model) errors.push("missing_embedding_model");
  if (removedMetadataKeys.length > 0) errors.push("metadata_disallowed_keys");
  return errors;
}

export function dedupeKey(doc: VectorDoc) {
  return `${doc.run_id}::${doc.embedding_model}`;
}
