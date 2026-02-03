import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import type { VectorDoc, SimilarVectorResult } from "./vector_types";

type Backend = "openai" | "pinecone" | "supabase" | "none";

function getBackend(): Backend {
  const value = process.env.LEARNING_VECTOR_BACKEND;
  if (value === "openai" || value === "pinecone" || value === "supabase" || value === "none") return value;
  return "none";
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

async function embedTexts(texts: string[], model: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({ model, input: texts });
  return response.data.map((item) => item.embedding);
}

async function ensureEmbeddings(docs: VectorDoc[]) {
  const model = docs[0]?.embedding_model ?? "text-embedding-3-small";
  const toEmbed = docs.filter((doc) => doc.embedding.length === 0);
  if (toEmbed.length === 0) return docs;
  const embeddings = await embedTexts(
    toEmbed.map((doc) => doc.summary),
    model
  );
  toEmbed.forEach((doc, idx) => {
    doc.embedding = embeddings[idx] ?? [];
    doc.embedding_model = model;
  });
  return docs;
}

export async function embedSummary(summary: string, model = "text-embedding-3-small") {
  const embeddings = await embedTexts([summary], model);
  return embeddings[0] ?? [];
}

function localIndexPath() {
  return path.join(process.cwd(), "runs", "learning", "vector_index.jsonl");
}

async function upsertLocal(docs: VectorDoc[]) {
  fs.mkdirSync(path.dirname(localIndexPath()), { recursive: true });
  const lines = docs.map((doc) => JSON.stringify(doc)).join("\n");
  fs.appendFileSync(localIndexPath(), lines ? `${lines}\n` : "");
}

async function queryLocal(embedding: number[], topK: number): Promise<SimilarVectorResult[]> {
  const filePath = localIndexPath();
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/).filter(Boolean);
  const scored = lines
    .map((line) => JSON.parse(line) as VectorDoc)
    .filter((doc) => doc.embedding?.length)
    .map((doc) => ({
      doc,
      score: cosineSimilarity(embedding, doc.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored.map(({ doc, score }) => ({
    id: doc.id,
    run_id: doc.run_id,
    industry_key: doc.industry_key,
    created_at: doc.created_at,
    score,
    pressure_keys: (doc.metadata.pressure_keys as string[]) ?? [],
    boundary_class: (doc.metadata.boundary_class as string) ?? undefined,
  }));
}

async function upsertOpenAI(docs: VectorDoc[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const client = new OpenAI({ apiKey }) as any;
  const storeId =
    process.env.OPENAI_VECTOR_STORE_ID ??
    (await client.vectorStores?.create?.({ name: "learning_vectors" }))?.id;
  if (!storeId) {
    await upsertLocal(docs);
    return;
  }
  const uploadDir = path.join(process.cwd(), "runs", "learning", "vector_uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, `${Date.now()}_vectors.jsonl`);
  const lines = docs.map((doc) => JSON.stringify({ id: doc.id, summary: doc.summary, metadata: doc.metadata })).join("\n");
  fs.writeFileSync(filePath, lines ? `${lines}\n` : "");
  const file = await client.files.create({ file: fs.createReadStream(filePath), purpose: "assistants" });
  await client.vectorStores?.files?.create(storeId, { file_id: file.id });
}

async function queryOpenAI(summary: string, topK: number): Promise<SimilarVectorResult[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const storeId = process.env.OPENAI_VECTOR_STORE_ID;
  if (!apiKey || !storeId) return [];
  const client = new OpenAI({ apiKey }) as any;
  if (!client.vectorStores?.search) return [];
  const response = await client.vectorStores.search(storeId, { query: summary, top_k: topK });
  const data = response?.data ?? [];
  return data.map((item: any) => ({
    id: item.id,
    run_id: item.metadata?.run_id,
    industry_key: item.metadata?.industry_key,
    created_at: item.metadata?.created_at,
    score: item.score ?? 0,
    pressure_keys: item.metadata?.pressure_keys ?? [],
    boundary_class: item.metadata?.boundary_class,
  }));
}

async function upsertPinecone(docs: VectorDoc[]) {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexHost = process.env.PINECONE_INDEX;
  if (!apiKey || !indexHost) throw new Error("Missing Pinecone configuration");
  const host = indexHost.startsWith("http") ? indexHost : `https://${indexHost}`;
  await fetch(`${host}/vectors/upsert`, {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vectors: docs.map((doc) => ({
        id: doc.id,
        values: doc.embedding,
        metadata: {
          run_id: doc.run_id,
          industry_key: doc.industry_key,
          created_at: doc.created_at,
          pressure_keys: doc.metadata.pressure_keys,
          boundary_class: doc.metadata.boundary_class,
        },
      })),
      namespace: "learning",
    }),
  });
}

async function queryPinecone(embedding: number[], topK: number): Promise<SimilarVectorResult[]> {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexHost = process.env.PINECONE_INDEX;
  if (!apiKey || !indexHost) throw new Error("Missing Pinecone configuration");
  const host = indexHost.startsWith("http") ? indexHost : `https://${indexHost}`;
  const response = await fetch(`${host}/query`, {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vector: embedding,
      topK,
      includeMetadata: true,
      namespace: "learning",
    }),
  });
  const json = await response.json();
  const matches = json.matches ?? [];
  return matches.map((match: any) => ({
    id: match.id,
    run_id: match.metadata?.run_id,
    industry_key: match.metadata?.industry_key,
    created_at: match.metadata?.created_at,
    score: match.score ?? 0,
    pressure_keys: match.metadata?.pressure_keys ?? [],
    boundary_class: match.metadata?.boundary_class,
  }));
}

async function upsertSupabase(docs: VectorDoc[]) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase configuration");
  await fetch(`${url}/rest/v1/learning_vectors`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(
      docs.map((doc) => ({
        id: doc.id,
        embedding: doc.embedding,
        metadata: {
          run_id: doc.run_id,
          industry_key: doc.industry_key,
          created_at: doc.created_at,
          pressure_keys: doc.metadata.pressure_keys,
          boundary_class: doc.metadata.boundary_class,
        },
        created_at: doc.created_at,
      }))
    ),
  });
}

async function querySupabase(embedding: number[], topK: number): Promise<SimilarVectorResult[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase configuration");
  const response = await fetch(`${url}/rest/v1/rpc/match_learning_vectors`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_count: topK,
    }),
  });
  const matches = await response.json();
  return (matches ?? []).map((match: any) => ({
    id: match.id,
    run_id: match.metadata?.run_id,
    industry_key: match.metadata?.industry_key,
    created_at: match.metadata?.created_at,
    score: match.score ?? 0,
    pressure_keys: match.metadata?.pressure_keys ?? [],
    boundary_class: match.metadata?.boundary_class,
  }));
}

export async function upsertVectorDocs(docs: VectorDoc[]): Promise<void> {
  if (docs.length === 0) return;
  await ensureEmbeddings(docs);
  const backend = getBackend();
  if (backend === "none") return;
  if (backend === "openai") {
    await upsertOpenAI(docs);
    if (!process.env.OPENAI_VECTOR_STORE_ID) {
      await upsertLocal(docs);
    }
    return;
  }
  if (backend === "pinecone") {
    await upsertPinecone(docs);
    return;
  }
  if (backend === "supabase") {
    await upsertSupabase(docs);
  }
}

export async function querySimilar(params: {
  summary: string;
  embedding: number[];
  topK?: number;
}): Promise<SimilarVectorResult[]> {
  const backend = getBackend();
  const topK = params.topK ?? 5;
  if (backend === "none") return [];
  if (backend === "openai") {
    if (process.env.OPENAI_VECTOR_STORE_ID) {
      return queryOpenAI(params.summary, topK);
    }
    return queryLocal(params.embedding, topK);
  }
  if (backend === "pinecone") {
    return queryPinecone(params.embedding, topK);
  }
  if (backend === "supabase") {
    return querySupabase(params.embedding, topK);
  }
  return [];
}
