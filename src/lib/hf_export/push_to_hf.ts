/**
 * Push to Hugging Face Hub
 * 
 * Uploads local dataset bundle to HF Hub using Python helper.
 * Requires:
 * - HF_TOKEN environment variable
 * - Python with huggingface_hub installed
 * - scripts/hf/push_dataset.py helper
 */

import { spawn } from "child_process";
import path from "path";
import { getHFExportConfig, type HFPushResult } from "./types";

/**
 * Push to Hugging Face Hub
 * 
 * @param bundleDir - Path to local bundle directory (with dataset.jsonl + dataset_info.json)
 * @param options - Push options
 * @returns Push result with revision or error
 */
export async function pushToHF(
  bundleDir: string,
  options: {
    repo?: string;
    private?: boolean;
    commitMessage?: string;
  } = {}
): Promise<HFPushResult> {
  const config = getHFExportConfig();
  
  if (!config.enabled) {
    return {
      pushed: false,
      error: "HF_EXPORT_ENABLED=false",
    };
  }
  
  if (!config.token) {
    return {
      pushed: false,
      error: "HF_TOKEN not set",
    };
  }
  
  const repo = options.repo ?? config.repo;
  const isPrivate = options.private ?? config.private;
  const commitMessage = options.commitMessage ?? `Update signals_v1 dataset`;
  
  console.log(`[HF Push] Uploading to ${repo} (private=${isPrivate})...`);
  
  // Check if Python helper exists
  const helperPath = path.resolve(process.cwd(), "scripts/hf/push_dataset.py");
  
  // Spawn Python helper
  return new Promise<HFPushResult>((resolve) => {
    const args = [
      helperPath,
      "--bundle-dir",
      bundleDir,
      "--repo",
      repo,
      "--commit-message",
      commitMessage,
    ];
    
    if (isPrivate) {
      args.push("--private");
    }
    
    const proc = spawn("python", args, {
      env: {
        ...process.env,
        HF_TOKEN: config.token ?? undefined,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let stdout = "";
    let stderr = "";
    
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    
    proc.on("close", (code: number | null) => {
      if (code === 0) {
        // Extract revision from stdout (Python script prints "revision:<sha>")
        const revMatch = stdout.match(/revision:([a-f0-9]+)/);
        const revision = revMatch?.[1];
        
        console.log(`[HF Push] Success (revision=${revision})`);
        resolve({
          pushed: true,
          revision,
        });
      } else {
        console.error(`[HF Push] Failed (exit code ${code})`);
        resolve({
          pushed: false,
          error: stderr || `Exit code ${code}`,
        });
      }
    });
    
    proc.on("error", (err: Error) => {
      console.error(`[HF Push] Spawn error:`, err);
      resolve({
        pushed: false,
        error: err.message,
      });
    });
  });
}
