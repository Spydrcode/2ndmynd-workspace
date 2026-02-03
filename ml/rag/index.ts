export type { RagDoc, RagChunk, RagContext } from "./types";
export { ingestDocs, ingestFromJsonl } from "./ingest";
export { retrieveContext } from "./retrieve";

export async function getRagContext(params: {
  workspace_id: string;
  business_id?: string;
  query: string;
}): Promise<{
  context: string;
  sources: string[];
  context_ids: string[];
}> {
  return retrieveContext({
    query: params.query,
    workspace_id: params.workspace_id,
    business_id: params.business_id,
  });
}
