import path from "node:path";

import { parseBooleanArg, readCliArg } from "../train/cli_args";
import { resolveSynthesisDatasetPath } from "./ops_paths";

export type SynthShipArgs = {
  dry_run: boolean;
  days: number;
  base_model: string;
  suffix: string;
  auto_promote: boolean;
  approved_only: boolean;
  skip_runpacks: boolean;
  packs_dir: string;
  iterations: number;
  target_runs: number;
  client_id: string;
  industry?: string;
  seed?: number;
  dataset_path: string;
  min_rows: number;
  force: boolean;
  notes?: string;
  poll_job: boolean;
  poll_interval_seconds: number;
  poll_timeout_minutes: number;
  live_min_rows: number;
  max_homogeneity_share: number;
  industry_mix: "balanced" | "weighted";
  min_industries: number;
  ensure_diversity: boolean;
};

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function generatedSuffix(): string {
  return `2ndmynd-synth-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
}

export function parseSynthShipArgs(argv: string[]): SynthShipArgs {
  const dry_run = parseBooleanArg(readCliArg(argv, "dry_run"), true);
  const base_model = readCliArg(argv, "base_model") ?? "gpt-4.1-mini-2025-04-14";
  const suffix = readCliArg(argv, "suffix") ?? generatedSuffix();

  if (!dry_run && (!suffix || suffix.trim().length === 0)) {
    throw new Error("--suffix is required when --dry_run=false.");
  }

  return {
    dry_run,
    days: Math.max(1, parseNumber(readCliArg(argv, "days"), 90)),
    base_model,
    suffix,
    auto_promote: parseBooleanArg(readCliArg(argv, "auto_promote"), false),
    approved_only: parseBooleanArg(readCliArg(argv, "approved_only"), true),
    skip_runpacks: parseBooleanArg(readCliArg(argv, "skip_runpacks"), false),
    packs_dir:
      readCliArg(argv, "packs_dir") ??
      [
        path.resolve(process.cwd(), "src", "intelligence_v4", "evals", "fixtures"),
        path.resolve(process.cwd(), "src", "intelligence_v4", "evals", "fixtures_synth"),
      ].join(","),
    iterations: Math.max(1, Math.floor(parseNumber(readCliArg(argv, "iterations"), 10))),
    target_runs: Math.max(1, Math.floor(parseNumber(readCliArg(argv, "target_runs"), 50))),
    client_id: readCliArg(argv, "client_id") ?? "test-client-synth",
    industry: readCliArg(argv, "industry") ?? undefined,
    seed: readCliArg(argv, "seed") ? Number(readCliArg(argv, "seed")) : undefined,
    dataset_path: path.resolve(readCliArg(argv, "dataset") ?? resolveSynthesisDatasetPath()),
    min_rows: Math.max(0, Math.floor(parseNumber(readCliArg(argv, "min_rows"), 1))),
    force: parseBooleanArg(readCliArg(argv, "force"), false),
    notes: readCliArg(argv, "notes") ?? undefined,
    poll_job: parseBooleanArg(readCliArg(argv, "poll_job"), false),
    poll_interval_seconds: Math.max(5, Math.floor(parseNumber(readCliArg(argv, "poll_interval_seconds"), 30))),
    poll_timeout_minutes: Math.max(1, Math.floor(parseNumber(readCliArg(argv, "poll_timeout_minutes"), 120))),
    live_min_rows: Math.max(1, Math.floor(parseNumber(readCliArg(argv, "live_min_rows"), 40))),
    max_homogeneity_share: Math.min(
      1,
      Math.max(0, parseNumber(readCliArg(argv, "max_homogeneity_share"), 0.8))
    ),
    industry_mix: readCliArg(argv, "industry_mix") === "weighted" ? "weighted" : "balanced",
    min_industries: Math.max(1, Math.floor(parseNumber(readCliArg(argv, "min_industries"), 6))),
    ensure_diversity: parseBooleanArg(readCliArg(argv, "ensure_diversity"), true),
  };
}
