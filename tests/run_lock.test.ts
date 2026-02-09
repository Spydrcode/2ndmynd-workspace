import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireRunLock, releaseRunLock } from "../src/lib/intelligence/run_lock";

let testDir = "";
let testDbPath = "";

function cleanupTestDb() {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

describe("run_lock (SQLite)", () => {
  beforeEach(() => {
    cleanupTestDb();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-lock-"));
    testDbPath = path.join(testDir, "intelligence.db");
    process.env.INTELLIGENCE_DB_PATH = testDbPath;
  });

  afterEach(() => {
    cleanupTestDb();
    delete process.env.INTELLIGENCE_DB_PATH;
    testDir = "";
    testDbPath = "";
  });

  it("acquires lock for a workspace", async () => {
    const result = await acquireRunLock("workspace-1", "user-1", 300);

    expect(result.acquired).toBe(true);
    expect(result.lock_id).toBeDefined();
  });

  it("rejects concurrent lock acquisition for same workspace", async () => {
    const result1 = await acquireRunLock("workspace-1", "user-1", 300);
    expect(result1.acquired).toBe(true);

    const result2 = await acquireRunLock("workspace-1", "user-2", 300);
    expect(result2.acquired).toBe(false);
    expect(result2.message).toContain("already running");
  });

  it("allows lock after release", async () => {
    const result1 = await acquireRunLock("workspace-1", "user-1", 300);
    expect(result1.acquired).toBe(true);

    await releaseRunLock(result1.lock_id!);

    const result2 = await acquireRunLock("workspace-1", "user-2", 300);
    expect(result2.acquired).toBe(true);
  });

  it("allows lock after TTL expires", async () => {
    // Acquire lock with 1 second TTL
    const result1 = await acquireRunLock("workspace-1", "user-1", 1);
    expect(result1.acquired).toBe(true);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Should be able to acquire again
    const result2 = await acquireRunLock("workspace-1", "user-2", 300);
    expect(result2.acquired).toBe(true);
  });

  it("allows locks for different workspaces concurrently", async () => {
    const result1 = await acquireRunLock("workspace-1", "user-1", 300);
    expect(result1.acquired).toBe(true);

    const result2 = await acquireRunLock("workspace-2", "user-2", 300);
    expect(result2.acquired).toBe(true);
  });

  it("handles release of non-existent lock gracefully", async () => {
    await expect(releaseRunLock("fake-lock-id")).resolves.not.toThrow();
  });

  it("renews expired lock with new owner", async () => {
    // User 1 gets lock with short TTL
    const result1 = await acquireRunLock("workspace-1", "user-1", 1);
    expect(result1.acquired).toBe(true);

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // User 2 gets lock (should succeed as expired)
    const result2 = await acquireRunLock("workspace-1", "user-2", 300);
    expect(result2.acquired).toBe(true);
    expect(result2.lock_id).not.toBe(result1.lock_id);
  });
});
