import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";

export type RunLock = {
  lock_id: string;
  workspace_id: string;
  owner: string;
  expires_at: string;
};

export type AcquireLockResult = {
  acquired: boolean;
  lock_id?: string;
  message?: string;
};

function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSqliteDbPath() {
  return process.env.INTELLIGENCE_DB_PATH || path.resolve("tmp", "intelligence.db");
}

function getSqlite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const dbPath = getSqliteDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    create table if not exists run_locks (
      workspace_id text primary key,
      lock_id text not null,
      owner text not null,
      expires_at text not null
    );
  `);
  return db;
}

async function acquireRunLockSqlite(
  workspace_id: string,
  owner: string,
  ttl_seconds: number = 300
): Promise<AcquireLockResult> {
  const db = getSqlite();
  try {
    const now = new Date();
    const expires_at = new Date(now.getTime() + ttl_seconds * 1000).toISOString();
    const lock_id = crypto.randomUUID();

    // Check existing lock
    const existing = db
      .prepare("select * from run_locks where workspace_id = ?")
      .get(workspace_id);

    if (existing) {
      const expiryDate = new Date(existing.expires_at);
      if (expiryDate > now) {
        return {
          acquired: false,
          message: "A snapshot is already running for this workspace. Please wait a moment and refresh.",
        };
      }
    }

    // Acquire or renew lock
    db.prepare(
      `insert into run_locks (workspace_id, lock_id, owner, expires_at) 
       values (?, ?, ?, ?)
       on conflict(workspace_id) do update set 
         lock_id = excluded.lock_id,
         owner = excluded.owner,
         expires_at = excluded.expires_at`
    ).run(workspace_id, lock_id, owner, expires_at);

    return { acquired: true, lock_id };
  } finally {
    db.close();
  }
}

async function releaseRunLockSqlite(lock_id: string): Promise<void> {
  const db = getSqlite();
  try {
    db.prepare("delete from run_locks where lock_id = ?").run(lock_id);
  } finally {
    db.close();
  }
}

async function acquireRunLockSupabase(
  workspace_id: string,
  owner: string,
  ttl_seconds: number = 300
): Promise<AcquireLockResult> {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const expires_at = new Date(now.getTime() + ttl_seconds * 1000).toISOString();
  const lock_id = crypto.randomUUID();

  // Check existing lock
  const { data: existing } = await supabase
    .from("run_locks")
    .select("*")
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  if (existing) {
    const expiryDate = new Date(existing.expires_at);
    if (expiryDate > now) {
      return {
        acquired: false,
        message: "A snapshot is already running for this workspace. Please wait a moment and refresh.",
      };
    }
  }

  // Acquire or renew lock
  const { error } = await supabase.from("run_locks").upsert(
    {
      workspace_id,
      lock_id,
      owner,
      expires_at,
    },
    { onConflict: "workspace_id" }
  );

  if (error) {
    return { acquired: false, message: `Lock acquisition failed: ${error.message}` };
  }

  return { acquired: true, lock_id };
}

async function releaseRunLockSupabase(lock_id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.from("run_locks").delete().eq("lock_id", lock_id);
}

export async function acquireRunLock(
  workspace_id: string,
  owner: string,
  ttl_seconds: number = 300
): Promise<AcquireLockResult> {
  if (hasSupabaseConfig()) {
    return acquireRunLockSupabase(workspace_id, owner, ttl_seconds);
  }
  return acquireRunLockSqlite(workspace_id, owner, ttl_seconds);
}

export async function releaseRunLock(lock_id: string): Promise<void> {
  if (hasSupabaseConfig()) {
    return releaseRunLockSupabase(lock_id);
  }
  return releaseRunLockSqlite(lock_id);
}
