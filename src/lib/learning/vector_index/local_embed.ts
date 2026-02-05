/**
 * Local Embeddings (Node Wrapper)
 * 
 * Wraps Python sentence-transformers script.
 * Generates 384-d embeddings using all-MiniLM-L6-v2.
 */

import { spawn } from "child_process";
import path from "path";

export interface LocalEmbedConfig {
  enabled: boolean;
  model: string;
  dim: number;
}

export function getLocalEmbedConfig(): LocalEmbedConfig {
  return {
    enabled: process.env.LOCAL_EMBEDDINGS_ENABLED === "true",
    model: process.env.LOCAL_EMBEDDINGS_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2",
    dim: parseInt(process.env.LOCAL_EMBEDDINGS_DIM ?? "384", 10),
  };
}

/**
 * Generate Local Embedding
 * 
 * @param text - Text to embed
 * @returns 384-d embedding vector or null if unavailable
 */
export async function generateLocalEmbedding(text: string): Promise<number[] | null> {
  const config = getLocalEmbedConfig();
  
  if (!config.enabled) {
    return null;
  }
  
  if (process.env.REQUIRE_PYTHON_WIRING === "1" && process.env.REQUIRE_PYTHON_WIRING !== "1") {
    console.warn("[Local Embed] Python wiring required but not enabled");
    return null;
  }
  
  const scriptPath = path.resolve(__dirname, "local_embed.py");
  
  return new Promise<number[] | null>((resolve) => {
    const args = [
      scriptPath,
      "--text",
      text,
      "--model",
      config.model,
    ];
    
    const proc = spawn("python", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let stdout = "";
    let stderr = "";
    
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    
    proc.on("close", (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          const embedding = result.embedding;
          
          if (Array.isArray(embedding) && embedding.length === config.dim) {
            resolve(embedding);
          } else {
            console.error(`[Local Embed] Invalid embedding dim: ${embedding?.length} (expected ${config.dim})`);
            resolve(null);
          }
        } catch (err) {
          console.error("[Local Embed] Failed to parse result:", err);
          resolve(null);
        }
      } else {
        console.error(`[Local Embed] Script failed (code ${code}):`, stderr);
        resolve(null);
      }
    });
    
    proc.on("error", (err) => {
      console.error("[Local Embed] Spawn error:", err);
      resolve(null);
    });
  });
}

/**
 * Generate Batch Embeddings
 * 
 * @param items - Array of {id, text} items
 * @returns Array of {id, embedding} or null if unavailable
 */
export async function generateBatchEmbeddings(
  items: { id: string; text: string }[]
): Promise<{ id: string; embedding: number[] }[] | null> {
  const config = getLocalEmbedConfig();
  
  if (!config.enabled) {
    return null;
  }
  
  // Write batch file
  const { promises: fs } = await import("fs");
  const { tmpdir } = await import("os");
  const batchPath = path.join(tmpdir(), `local_embed_batch_${Date.now()}.jsonl`);
  
  const batchLines = items.map((item) => JSON.stringify(item)).join("\n");
  await fs.writeFile(batchPath, batchLines + "\n", "utf-8");
  
  const scriptPath = path.resolve(__dirname, "local_embed.py");
  
  return new Promise<{ id: string; embedding: number[] }[] | null>(async (resolve) => {
    const args = [
      scriptPath,
      "--batch_file",
      batchPath,
      "--model",
      config.model,
    ];
    
    const proc = spawn("python", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let stdout = "";
    
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    
    proc.stderr?.on("data", (chunk) => {
      // Ignore stderr (progress bar noise)
      void chunk;
    });
    
    proc.on("close", async (code) => {
      // Clean up batch file
      await fs.unlink(batchPath).catch(() => {});
      
      if (code === 0) {
        try {
          const lines = stdout.split("\n").filter((line) => line.trim());
          const results = lines.map((line) => JSON.parse(line));
          resolve(results);
        } catch (err) {
          console.error("[Local Embed] Failed to parse batch results:", err);
          resolve(null);
        }
      } else {
        console.error(`[Local Embed] Batch failed (code ${code})`);
        resolve(null);
      }
    });
    
    proc.on("error", async (err) => {
      console.error("[Local Embed] Spawn error:", err);
      await fs.unlink(batchPath).catch(() => {});
      resolve(null);
    });
  });
}
