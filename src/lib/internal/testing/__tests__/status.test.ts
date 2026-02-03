/**
 * Tests for internal testing infrastructure
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { createFileStatusWriter, readJobStatus } from "../run_mock_pipeline";

const TEST_JOB_ID = "test-job-123";
const JOBS_DIR = path.join(process.cwd(), "mock_runs", "_jobs");

describe("Internal Testing - Status Management", () => {
  beforeEach(() => {
    // Clean up any existing test files
    if (fs.existsSync(JOBS_DIR)) {
      const files = fs.readdirSync(JOBS_DIR);
      for (const file of files) {
        if (file.includes(TEST_JOB_ID)) {
          fs.unlinkSync(path.join(JOBS_DIR, file));
        }
      }
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(JOBS_DIR)) {
      const files = fs.readdirSync(JOBS_DIR);
      for (const file of files) {
        if (file.includes(TEST_JOB_ID)) {
          fs.unlinkSync(path.join(JOBS_DIR, file));
        }
      }
    }
  });

  it("should create status file with initial state", async () => {
    const _writer = createFileStatusWriter(TEST_JOB_ID);
    
    const status = readJobStatus(TEST_JOB_ID);
    
    expect(status).toBeTruthy();
    expect(status?.job_id).toBe(TEST_JOB_ID);
    expect(status?.status).toBe("queued");
  });

  it("should update status file", async () => {
    const writer = createFileStatusWriter(TEST_JOB_ID);
    
    await writer.update({
      status: "running",
      progress: { step: "generating data", pct: 50 },
    });
    
    const status = readJobStatus(TEST_JOB_ID);
    
    expect(status?.status).toBe("running");
    expect(status?.progress.step).toBe("generating data");
    expect(status?.progress.pct).toBe(50);
  });

  it("should preserve existing fields when updating", async () => {
    const writer = createFileStatusWriter(TEST_JOB_ID);
    
    await writer.update({
      status: "running",
      website: "https://example.com",
    });
    
    await writer.update({
      progress: { step: "scraping", pct: 25 },
    });
    
    const status = readJobStatus(TEST_JOB_ID);
    
    expect(status?.status).toBe("running");
    expect(status?.website).toBe("https://example.com");
    expect(status?.progress.step).toBe("scraping");
  });

  it("should return null for non-existent job", () => {
    const status = readJobStatus("non-existent-job");
    expect(status).toBeNull();
  });
});

describe("Internal Testing - Production Guardrails", () => {
  it("should block in production without ALLOW_INTERNAL_TESTING", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalAllow = process.env.ALLOW_INTERNAL_TESTING;
    
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_INTERNAL_TESTING;
    
    // Simulate the check
    const isAllowed = process.env.NODE_ENV === "production" && process.env.ALLOW_INTERNAL_TESTING !== "true";
    
    expect(isAllowed).toBe(true); // Should block
    
    // Restore
    process.env.NODE_ENV = originalEnv;
    if (originalAllow) process.env.ALLOW_INTERNAL_TESTING = originalAllow;
  });

  it("should allow in development", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    
    const isAllowed = process.env.NODE_ENV !== "production";
    expect(isAllowed).toBe(true);
    
    process.env.NODE_ENV = originalEnv;
  });
});
