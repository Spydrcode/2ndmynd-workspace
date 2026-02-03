/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * INTERNAL ONLY - Job runner script
 * 
 * This script is spawned as a separate process to run mock pipeline jobs.
 * It allows the API to return immediately while the job runs in background.
 */

import {
  runMockPipelineJob,
  createFileStatusWriter,
  type MockPipelineParams,
} from "./run_mock_pipeline";

async function main() {
  const [, , job_id, industry, seed, days, capture_learning, auto_label] = process.argv;

  if (!job_id || !industry) {
    console.error("Usage: node run_job.ts <job_id> <industry> [seed] [days] [capture_learning] [auto_label]");
    process.exit(1);
  }

  const params: MockPipelineParams = {
    industry: industry as any,
    seed: seed ? parseInt(seed) : undefined,
    days: days ? parseInt(days) : 90,
    capture_learning: capture_learning === "true",
    auto_label: auto_label === "true",
  };

  const statusWriter = createFileStatusWriter(job_id);

  console.log(`[Job ${job_id}] Starting mock pipeline job...`);
  console.log(`[Job ${job_id}] Params:`, params);

  try {
    await runMockPipelineJob(params, statusWriter);
    console.log(`[Job ${job_id}] Job completed successfully`);
  } catch (error) {
    console.error(`[Job ${job_id}] Job failed:`, error);
    process.exit(1);
  }
}

main();
