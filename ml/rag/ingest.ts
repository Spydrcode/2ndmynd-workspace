import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { RagDoc } from "./types";
import { upsertDocs } from "./store";
import { embedTexts } from "./embeddings";
import { assertValid, validateRagDoc } from "../schemas/validators";

export type RagDocInput = {
  id?: string;
  workspace_id: string;
  business_id?: string;
  content: string;
  source: string;
  metadata?: Record<string, string | number | boolean | null>;
  created_at?: string;
};

const DEFAULT_CHUNK_CHARS = 800;

function chunkText(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [trimmed];
  const parts = trimmed.split(/\n{2,}/g);
  const chunks: string[] = [];
  let buffer = "";
  for (const part of parts) {
    if (buffer.length + part.length + 2 <= maxChars) {
      buffer = buffer ? `${buffer}\n\n${part}` : part;
    } else {
      if (buffer) chunks.push(buffer);
      buffer = part;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];
    const pieces: string[] = [];
    for (let i = 0; i < chunk.length; i += maxChars) {
      pieces.push(chunk.slice(i, i + maxChars));
    }
    return pieces;
  });
}

export async function ingestDocs(
  inputs: RagDocInput[],
  options?: { chunkChars?: number }
): Promise<{ count: number }> {
  const chunkChars = options?.chunkChars ?? DEFAULT_CHUNK_CHARS;
  const docs: RagDoc[] = [];

  for (const input of inputs) {
    if (!input.workspace_id || !input.content || !input.source) {
      throw new Error("RagDocInput missing required fields");
    }
    const createdAt = input.created_at ?? new Date().toISOString();
    const chunks = chunkText(input.content, chunkChars);
    chunks.forEach((chunk, index) => {
      const baseId = input.id ?? crypto.randomUUID();
      const id = chunks.length === 1 ? baseId : `${baseId}-chunk-${index + 1}`;
      docs.push({
        id,
        workspace_id: input.workspace_id,
        business_id: input.business_id,
        content: chunk,
        source: input.source,
        metadata: input.metadata,
        created_at: createdAt,
      });
    });
  }

  const embeddings = await embedTexts(docs.map((doc) => doc.content));
  const withEmbeddings = docs.map((doc, index) => ({
    ...doc,
    embedding: embeddings[index],
  }));

  for (const doc of withEmbeddings) {
    assertValid(validateRagDoc, doc, "RagDoc");
  }

  upsertDocs(withEmbeddings);
  return { count: withEmbeddings.length };
}

export async function ingestFromJsonl(params: {
  filePath: string;
  workspace_id: string;
  business_id?: string;
  source: string;
}): Promise<{ count: number }> {
  const resolved = path.resolve(params.filePath);
  const content = fs.readFileSync(resolved, "utf-8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const inputs: RagDocInput[] = lines.map((line) => {
    const parsed = JSON.parse(line) as Partial<RagDocInput>;
    return {
      id: parsed.id,
      workspace_id: params.workspace_id,
      business_id: params.business_id,
      content: String(parsed.content ?? ""),
      source: params.source,
      metadata: parsed.metadata,
      created_at: parsed.created_at,
    };
  });
  return ingestDocs(inputs);
}
