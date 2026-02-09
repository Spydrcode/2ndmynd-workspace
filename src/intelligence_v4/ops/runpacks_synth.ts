import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";
import {
  discoverSynthPackDirectories,
  loadSynthPackFromDirectory,
} from "@/src/intelligence_v4/synth_packs";

import { runPipelineV4 } from "../pipeline/run_pipeline_v4";
import { parseBooleanArg, readCliArg } from "../train/cli_args";
import { createOpsLogger } from "./ops_logger";
import { resolveRunIdsPath, resolveSynthShipDir, toFileStamp } from "./ops_paths";

type FixtureLike = {
  fixture_id?: string;
  input?: {
    business_name?: string;
    industry?: string;
    emyth_role?: "technician" | "manager" | "entrepreneur" | "mixed";
    snapshot_window_mode?: "last_90_days" | "last_100_closed_estimates";
    pack?: DataPackV0;
  };
  pack?: DataPackV0;
  business_name?: string;
  industry?: string;
  emyth_role?: "technician" | "manager" | "entrepreneur" | "mixed";
  snapshot_window_mode?: "last_90_days" | "last_100_closed_estimates";
};

export type SynthPackTemplate = {
  template_id: string;
  business_name: string;
  industry: string;
  emyth_role: "technician" | "manager" | "entrepreneur" | "mixed";
  snapshot_window_mode: "last_90_days" | "last_100_closed_estimates";
  pack: DataPackV0;
};

export type RunpacksSynthOptions = {
  packs_dir?: string;
  iterations?: number;
  minimum_runs?: number;
  client_id?: string;
  industry?: string;
  seed?: number;
  output_dir?: string;
  include_data_packs?: boolean;
  industry_mix?: "balanced" | "weighted";
  min_industries?: number;
  ensure_diversity?: boolean;
};

export type RunpacksSynthResult = {
  output_dir: string;
  run_ids_path: string;
  run_ids: string[];
  run_entries: Array<{
    run_id: string;
    industry: string;
    template_id: string;
    status: "succeeded" | "failed";
    reason?: string;
  }>;
  failed_runs: Array<{ run_id: string; reason: string }>;
  templates_used: number;
  industries_used: number;
  iterations: number;
  attempted_runs: number;
  succeeded_runs: number;
};

type CliArgs = {
  packs_dirs: string[];
  iterations: number;
  minimum_runs: number;
  client_id: string;
  industry?: string;
  seed?: number;
  output_dir?: string;
  include_data_packs: boolean;
  industry_mix: "balanced" | "weighted";
  min_industries: number;
  ensure_diversity: boolean;
};

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.resolve(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function toTemplate(candidate: unknown, sourceId: string): SynthPackTemplate | null {
  if (!candidate || typeof candidate !== "object") return null;
  const payload = candidate as FixtureLike;

  const nestedPack = payload.input?.pack;
  const directPack = payload.pack;
  const rawPack = nestedPack ?? directPack ?? (payload as { version?: string });
  if (!rawPack || typeof rawPack !== "object") return null;
  const pack = rawPack as DataPackV0;
  if (pack.version !== "data_pack_v0") return null;

  const business_name =
    payload.input?.business_name ?? payload.business_name ?? payload.fixture_id ?? `Business ${sourceId}`;
  const industry = payload.input?.industry ?? payload.industry ?? "unknown";
  const emyth_role = payload.input?.emyth_role ?? payload.emyth_role ?? "mixed";
  const snapshot_window_mode =
    payload.input?.snapshot_window_mode ?? payload.snapshot_window_mode ?? "last_90_days";

  return {
    template_id: sourceId,
    business_name,
    industry,
    emyth_role,
    snapshot_window_mode,
    pack,
  };
}

function loadTemplatesFromJsonDir(dir: string, prefix: string): SynthPackTemplate[] {
  const files = listJsonFiles(dir);
  const templates: SynthPackTemplate[] = [];

  for (const file of files) {
    try {
      const parsed = readJson(file);
      const template = toTemplate(parsed, `${prefix}:${path.basename(file, ".json")}`);
      if (template) templates.push(template);
    } catch {
      // Skip malformed fixture files.
    }
  }

  return templates;
}

async function loadTemplatesFromSynthRoot(root: string): Promise<SynthPackTemplate[]> {
  const templates: SynthPackTemplate[] = [];
  for (const dir of discoverSynthPackDirectories(root)) {
    try {
      const loaded = await loadSynthPackFromDirectory(dir);
      templates.push({
        template_id: `synth:${path.relative(root, dir).replace(/\\/g, "/")}`,
        business_name: loaded.manifest.business_name ?? `${loaded.manifest.industry} owner-led business`,
        industry: loaded.manifest.industry,
        emyth_role: loaded.manifest.emyth_role ?? "mixed",
        snapshot_window_mode: "last_90_days",
        pack: loaded.pack,
      });
    } catch {
      // Skip malformed synthetic pack directories.
    }
  }
  return templates;
}

function parseRoots(raw: string | undefined): string[] {
  const fallback = [
    path.resolve(process.cwd(), "src", "intelligence_v4", "evals", "fixtures"),
    path.resolve(process.cwd(), "src", "intelligence_v4", "evals", "fixtures_synth"),
  ];
  if (!raw || raw.trim().length === 0) return fallback;
  const roots = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => path.resolve(value));
  return roots.length > 0 ? roots : fallback;
}

function parseArgs(argv: string[]): CliArgs {
  const iterationsRaw = Number(readCliArg(argv, "iterations") ?? 10);
  const minimumRunsRaw = Number(readCliArg(argv, "minimum_runs") ?? 0);
  const seedRaw = readCliArg(argv, "seed");
  const seedValue = seedRaw !== undefined ? Number(seedRaw) : undefined;
  const mixRaw = readCliArg(argv, "industry_mix");

  return {
    packs_dirs: parseRoots(readCliArg(argv, "packs_dir")),
    iterations: Number.isFinite(iterationsRaw) ? Math.max(1, Math.floor(iterationsRaw)) : 10,
    minimum_runs: Number.isFinite(minimumRunsRaw) ? Math.max(0, Math.floor(minimumRunsRaw)) : 0,
    client_id: readCliArg(argv, "client_id") ?? "test-client-synth",
    industry: readCliArg(argv, "industry") ?? undefined,
    seed: Number.isFinite(seedValue ?? Number.NaN) ? seedValue : undefined,
    output_dir: readCliArg(argv, "output_dir") ? path.resolve(readCliArg(argv, "output_dir") as string) : undefined,
    include_data_packs: parseBooleanArg(readCliArg(argv, "include_data_packs"), true),
    industry_mix: mixRaw === "weighted" ? "weighted" : "balanced",
    min_industries: Math.max(1, Math.floor(Number(readCliArg(argv, "min_industries") ?? 6))),
    ensure_diversity: parseBooleanArg(readCliArg(argv, "ensure_diversity"), true),
  };
}

function makeSeededShuffle(seed: number | undefined) {
  if (seed === undefined || !Number.isFinite(seed)) {
    return <T>(values: T[]) => values;
  }

  let state = Math.abs(Math.floor(seed)) || 1;
  const next = () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };

  return <T>(values: T[]) => {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
}

function writeRunIdsIndex(params: {
  output_dir: string;
  run_entries: Array<{
    run_id: string;
    industry: string;
    template_id: string;
    status: "succeeded" | "failed";
    reason?: string;
  }>;
  templates_used: number;
  industries_used: number;
  iterations: number;
}) {
  const runIdsPath = resolveRunIdsPath(params.output_dir);
  fs.mkdirSync(path.dirname(runIdsPath), { recursive: true });

  const failed_runs = params.run_entries
    .filter((entry) => entry.status === "failed")
    .map((entry) => ({ run_id: entry.run_id, reason: entry.reason ?? "run failed" }));

  const run_ids = params.run_entries.filter((entry) => entry.status === "succeeded").map((entry) => entry.run_id);

  fs.writeFileSync(
    runIdsPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        templates_used: params.templates_used,
        industries_used: params.industries_used,
        iterations: params.iterations,
        attempted_runs: params.run_entries.length,
        succeeded_runs: run_ids.length,
        failed_runs,
        run_ids,
        runs: params.run_entries,
      },
      null,
      2
    )
  );
  return runIdsPath;
}

function selectTemplates(params: {
  templates: SynthPackTemplate[];
  industry_mix: "balanced" | "weighted";
  iterations: number;
  minimum_runs: number;
  seed?: number;
}): SynthPackTemplate[] {
  const shuffle = makeSeededShuffle(params.seed);
  const byIndustry = new Map<string, SynthPackTemplate[]>();

  for (const template of params.templates) {
    const key = template.industry || "unknown";
    const bucket = byIndustry.get(key) ?? [];
    bucket.push(template);
    byIndustry.set(key, bucket);
  }

  const industries = shuffle([...byIndustry.keys()]);

  if (params.industry_mix === "weighted") {
    const flattened = shuffle([...params.templates]);
    const target = Math.max(params.minimum_runs, params.iterations * flattened.length);
    const selected: SynthPackTemplate[] = [];
    for (let i = 0; i < target; i += 1) {
      selected.push(flattened[i % flattened.length]);
    }
    return selected;
  }

  const perIndustryPools = new Map<string, SynthPackTemplate[]>();
  for (const industry of industries) {
    perIndustryPools.set(industry, shuffle(byIndustry.get(industry) ?? []));
  }

  const target = Math.max(params.minimum_runs, params.iterations * industries.length);
  const counters = new Map<string, number>(industries.map((industry) => [industry, 0]));
  const selected: SynthPackTemplate[] = [];

  for (let i = 0; i < target; i += 1) {
    const industry = industries[i % industries.length];
    const pool = perIndustryPools.get(industry) ?? [];
    if (pool.length === 0) continue;
    const index = counters.get(industry) ?? 0;
    selected.push(pool[index % pool.length]);
    counters.set(industry, index + 1);
  }

  return selected;
}

async function loadTemplates(args: CliArgs): Promise<SynthPackTemplate[]> {
  const templates: SynthPackTemplate[] = [];

  for (const root of args.packs_dirs) {
    if (!fs.existsSync(root)) continue;
    templates.push(...loadTemplatesFromJsonDir(root, "fixture"));
    templates.push(...(await loadTemplatesFromSynthRoot(root)));
  }

  if (args.include_data_packs) {
    templates.push(...loadTemplatesFromJsonDir(path.resolve(process.cwd(), "data", "packs"), "data_pack"));
  }

  return templates;
}

export async function runRunpacksSynth(options?: RunpacksSynthOptions): Promise<RunpacksSynthResult> {
  const args: CliArgs = options
    ? {
        packs_dirs: parseRoots(options.packs_dir),
        iterations: Math.max(1, options.iterations ?? 10),
        minimum_runs: Math.max(0, options.minimum_runs ?? 0),
        client_id: options.client_id ?? "test-client-synth",
        industry: options.industry,
        seed: options.seed,
        output_dir: options.output_dir ? path.resolve(options.output_dir) : undefined,
        include_data_packs: options.include_data_packs ?? true,
        industry_mix: options.industry_mix ?? "balanced",
        min_industries: Math.max(1, options.min_industries ?? 6),
        ensure_diversity: options.ensure_diversity ?? true,
      }
    : parseArgs(process.argv.slice(2));

  const logger = createOpsLogger();
  const allTemplates = await loadTemplates(args);
  const templates = args.industry
    ? allTemplates.filter((template) => template.industry.toLowerCase() === args.industry?.toLowerCase())
    : allTemplates;

  if (templates.length === 0) {
    throw new Error(`No valid templates found under: ${args.packs_dirs.join(", ")}`);
  }

  const industriesUsed = new Set(templates.map((template) => template.industry || "unknown"));
  if (args.ensure_diversity && industriesUsed.size < args.min_industries) {
    throw new Error(
      `Diversity precheck failed: found ${industriesUsed.size} industries, require at least ${args.min_industries}.`
    );
  }

  const selectedTemplates = selectTemplates({
    templates,
    industry_mix: args.industry_mix,
    iterations: args.iterations,
    minimum_runs: args.minimum_runs,
    seed: args.seed,
  });

  const outputDir = args.output_dir ?? resolveSynthShipDir(toFileStamp());
  fs.mkdirSync(outputDir, { recursive: true });

  const run_entries: Array<{
    run_id: string;
    industry: string;
    template_id: string;
    status: "succeeded" | "failed";
    reason?: string;
  }> = [];

  logger.info(
    `Running synthesis runpacks with ${templates.length} templates across ${industriesUsed.size} industries (${selectedTemplates.length} planned runs).`
  );

  for (const template of selectedTemplates) {
    const run_id = `synth-${toFileStamp()}-${crypto.randomUUID()}`;

    try {
      const result = await runPipelineV4({
        run_id,
        workspace_id: args.client_id,
        business_name: template.business_name,
        industry: args.industry ?? template.industry,
        emyth_role: template.emyth_role,
        snapshot_window_mode: template.snapshot_window_mode,
        pack: template.pack,
      });

      if (result.ok) {
        run_entries.push({
          run_id,
          industry: args.industry ?? template.industry,
          template_id: template.template_id,
          status: "succeeded",
        });
      } else {
        run_entries.push({
          run_id,
          industry: args.industry ?? template.industry,
          template_id: template.template_id,
          status: "failed",
          reason: result.error.reason,
        });
      }
    } catch (error) {
      run_entries.push({
        run_id,
        industry: args.industry ?? template.industry,
        template_id: template.template_id,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const run_ids_path = writeRunIdsIndex({
    output_dir: outputDir,
    run_entries,
    templates_used: templates.length,
    industries_used: industriesUsed.size,
    iterations: args.iterations,
  });

  const failed_runs = run_entries
    .filter((entry) => entry.status === "failed")
    .map((entry) => ({ run_id: entry.run_id, reason: entry.reason ?? "run failed" }));
  const run_ids = run_entries.filter((entry) => entry.status === "succeeded").map((entry) => entry.run_id);

  return {
    output_dir: outputDir,
    run_ids_path,
    run_ids,
    run_entries,
    failed_runs,
    templates_used: templates.length,
    industries_used: industriesUsed.size,
    iterations: args.iterations,
    attempted_runs: run_entries.length,
    succeeded_runs: run_ids.length,
  };
}

async function main() {
  const result = await runRunpacksSynth();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.includes("runpacks_synth.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
