import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";

export type WorkspaceRecord = {
  id: string;
  owner_user_id: string;
  name: string | null;
};

export type DataPackRecord = {
  id: string;
  workspace_id: string;
  source_tool: string;
  storage_paths: string[];
  normalized_json: unknown;
  stats_json: unknown;
};

export type RunRecord = {
  run_id: string;
  workspace_id: string;
  pack_id: string;
  status: string;
  mode: string;
  created_at?: string | null;
  input_hash?: string | null;
  website_url?: string | null;
  results_json?: unknown | null;
  business_profile_json?: unknown | null;
  error?: string | null;
};

type Store = {
  ensureWorkspaceForUser: (userId: string, email?: string | null) => Promise<WorkspaceRecord>;
  createDataPack: (record: Omit<DataPackRecord, "id">) => Promise<DataPackRecord>;
  createRun: (record: RunRecord) => Promise<RunRecord>;
  updateRun: (runId: string, updates: Partial<RunRecord>) => Promise<void>;
  getRun: (runId: string) => Promise<RunRecord | null>;
  listRuns: (workspaceId: string) => Promise<RunRecord[]>;
  countRunsToday: (workspaceId: string) => Promise<number>;
  getDataPack: (packId: string) => Promise<DataPackRecord | null>;
  createRemoteAssistRequest: (record: {
    workspace_id: string;
    tool?: string | null;
    notes?: string | null;
    status?: string | null;
    cal_link?: string | null;
    run_id?: string | null;
  }) => Promise<void>;
};

function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSqlite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const dbPath = path.resolve("tmp", "intelligence.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    create table if not exists workspaces (
      id text primary key,
      owner_user_id text not null,
      name text,
      created_at text not null
    );
    create table if not exists data_packs (
      id text primary key,
      workspace_id text not null,
      source_tool text not null,
      storage_paths text not null,
      normalized_json text not null,
      stats_json text not null,
      created_at text not null
    );
    create table if not exists runs (
      run_id text primary key,
      workspace_id text not null,
      pack_id text not null,
      status text not null,
      mode text not null,
      input_hash text,
      website_url text,
      results_json text,
      business_profile_json text,
      error text,
      created_at text not null
    );
    create table if not exists remote_assist_requests (
      id text primary key,
      workspace_id text not null,
      tool text,
      notes text,
      status text,
      cal_link text,
      run_id text,
      created_at text not null
    );
  `);
  return db;
}

const sqliteStore: Store = {
  async ensureWorkspaceForUser(userId, email) {
    const db = getSqlite();
    const existing = db.prepare("select * from workspaces where owner_user_id = ?").get(userId);
    if (existing) return existing;
    const id = crypto.randomUUID();
    const name = email ? email.split("@")[0] : "workspace";
    db.prepare(
      "insert into workspaces (id, owner_user_id, name, created_at) values (?, ?, ?, ?)"
    ).run(id, userId, name, new Date().toISOString());
    return { id, owner_user_id: userId, name };
  },
  async createDataPack(record) {
    const db = getSqlite();
    const id = crypto.randomUUID();
    db.prepare(
      "insert into data_packs (id, workspace_id, source_tool, storage_paths, normalized_json, stats_json, created_at) values (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      record.workspace_id,
      record.source_tool,
      JSON.stringify(record.storage_paths),
      JSON.stringify(record.normalized_json),
      JSON.stringify(record.stats_json),
      new Date().toISOString()
    );
    return { id, ...record };
  },
  async createRun(record) {
    const db = getSqlite();
    db.prepare(
      "insert into runs (run_id, workspace_id, pack_id, status, mode, input_hash, website_url, results_json, business_profile_json, error, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      record.run_id,
      record.workspace_id,
      record.pack_id,
      record.status,
      record.mode,
      record.input_hash ?? null,
      record.website_url ?? null,
      record.results_json ? JSON.stringify(record.results_json) : null,
      record.business_profile_json ? JSON.stringify(record.business_profile_json) : null,
      record.error ?? null,
      new Date().toISOString()
    );
    return record;
  },
  async updateRun(runId, updates) {
    const db = getSqlite();
    const fields = Object.keys(updates);
    if (!fields.length) return;
    const assignments = fields.map((field) => `${field} = ?`).join(", ");
    const values = fields.map((field) => {
      const value = (updates as Record<string, unknown>)[field];
      if (field.endsWith("_json")) return value ? JSON.stringify(value) : null;
      return value ?? null;
    });
    db.prepare(`update runs set ${assignments} where run_id = ?`).run(...values, runId);
  },
  async getRun(runId) {
    const db = getSqlite();
    const row = db.prepare("select * from runs where run_id = ?").get(runId);
    if (!row) return null;
    return {
      ...row,
      results_json: row.results_json ? JSON.parse(row.results_json) : null,
      business_profile_json: row.business_profile_json
        ? JSON.parse(row.business_profile_json)
        : null,
    };
  },
  async listRuns(workspaceId) {
    const db = getSqlite();
    const rows = db
      .prepare("select * from runs where workspace_id = ? order by created_at desc")
      .all(workspaceId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((row: any) => ({
      ...row,
      results_json: row.results_json ? JSON.parse(row.results_json) : null,
      business_profile_json: row.business_profile_json
        ? JSON.parse(row.business_profile_json)
        : null,
    }));
  },
  async countRunsToday(workspaceId) {
    const db = getSqlite();
    const today = new Date().toISOString().slice(0, 10);
    const row = db
      .prepare(
        "select count(*) as count from runs where workspace_id = ? and substr(created_at, 1, 10) = ?"
      )
      .get(workspaceId, today);
    return row?.count ?? 0;
  },
  async getDataPack(packId) {
    const db = getSqlite();
    const row = db.prepare("select * from data_packs where id = ?").get(packId);
    if (!row) return null;
    return {
      ...row,
      storage_paths: JSON.parse(row.storage_paths),
      normalized_json: JSON.parse(row.normalized_json),
      stats_json: JSON.parse(row.stats_json),
    };
  },
  async createRemoteAssistRequest(record) {
    const db = getSqlite();
    const id = crypto.randomUUID();
    db.prepare(
      "insert into remote_assist_requests (id, workspace_id, tool, notes, status, cal_link, run_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      record.workspace_id,
      record.tool ?? null,
      record.notes ?? null,
      record.status ?? "requested",
      record.cal_link ?? null,
      record.run_id ?? null,
      new Date().toISOString()
    );
  },
};

const supabaseStore: Store = {
  async ensureWorkspaceForUser(userId, email) {
    const supabase = createSupabaseAdminClient();
    const { data: existing } = await supabase
      .from("workspaces")
      .select("id, owner_user_id, name")
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (existing) return existing as WorkspaceRecord;

    const name = email ? email.split("@")[0] : "workspace";
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ owner_user_id: userId, name })
      .select("id, owner_user_id, name")
      .single();
    if (error) throw error;
    return data as WorkspaceRecord;
  },
  async createDataPack(record) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("data_packs")
      .insert({
        workspace_id: record.workspace_id,
        source_tool: record.source_tool,
        storage_paths: record.storage_paths,
        normalized_json: record.normalized_json,
        stats_json: record.stats_json,
      })
      .select("id, workspace_id, source_tool, storage_paths, normalized_json, stats_json")
      .single();
    if (error) throw error;
    return data as DataPackRecord;
  },
  async createRun(record) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("runs")
      .insert(record)
      .select("*")
      .single();
    if (error) throw error;
    return data as RunRecord;
  },
  async updateRun(runId, updates) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("runs").update(updates).eq("run_id", runId);
    if (error) throw error;
  },
  async getRun(runId) {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.from("runs").select("*").eq("run_id", runId).maybeSingle();
    return (data as RunRecord) ?? null;
  },
  async listRuns(workspaceId) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as RunRecord[]) ?? [];
  },
  async countRunsToday(workspaceId) {
    const supabase = createSupabaseAdminClient();
    const today = new Date();
    const start = new Date(today.toISOString().slice(0, 10));
    const { count, error } = await supabase
      .from("runs")
      .select("run_id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", start.toISOString());
    if (error) throw error;
    return count ?? 0;
  },
  async getDataPack(packId) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("data_packs")
      .select("*")
      .eq("id", packId)
      .maybeSingle();
    if (error) throw error;
    return (data as DataPackRecord) ?? null;
  },
  async createRemoteAssistRequest(record) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("remote_assist_requests").insert({
      workspace_id: record.workspace_id,
      tool: record.tool ?? null,
      notes: record.notes ?? null,
      status: record.status ?? "requested",
      cal_link: record.cal_link ?? null,
      run_id: record.run_id ?? null,
    });
    if (error) throw error;
  },
};

export function getStore(): Store {
  return hasSupabaseConfig() ? supabaseStore : sqliteStore;
}
