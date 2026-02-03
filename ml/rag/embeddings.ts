import OpenAI from "openai";
import crypto from "node:crypto";

function hashEmbedding(text: string, dimensions: number): number[] {
  const hash = crypto.createHash("sha256").update(text).digest();
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i += 1) {
    const byte = hash[i % hash.length];
    vector.push((byte / 255) * 2 - 1);
  }
  return vector;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (process.env.ML_RAG_EMBED_MODE === "mock" || !process.env.OPENAI_API_KEY) {
    return texts.map((text) => hashEmbedding(text, 32));
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
  const response = await client.embeddings.create({ model, input: texts });
  if (response.data.length !== texts.length) {
    throw new Error("Embedding response length mismatch");
  }
  return response.data.map((item) => item.embedding as number[]);
}
