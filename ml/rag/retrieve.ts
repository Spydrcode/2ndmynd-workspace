import type { RagChunk, RagContext } from "./types";
import { embedTexts } from "./embeddings";
import { querySimilar } from "./store";

function composeContext(chunks: RagChunk[], maxChars: number): RagContext {
  const lines: string[] = [];
  const sources: string[] = [];
  const contextIds: string[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const cleaned = chunk.content.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const line = `- ${chunk.source}: ${cleaned}`;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
    sources.push(chunk.source);
    contextIds.push(chunk.id);
  }

  return {
    context: lines.join("\n"),
    sources: Array.from(new Set(sources)),
    context_ids: contextIds,
  };
}

export async function retrieveContext(params: {
  query: string;
  workspace_id: string;
  business_id?: string;
  top_k?: number;
  max_chars?: number;
}): Promise<RagContext> {
  if (!params.query.trim()) {
    return { context: "", sources: [], context_ids: [] };
  }
  const [embedding] = await embedTexts([params.query]);
  const chunks = querySimilar({
    embedding,
    workspace_id: params.workspace_id,
    business_id: params.business_id,
    top_k: params.top_k ?? 5,
  });
  return composeContext(chunks, params.max_chars ?? 2000);
}
