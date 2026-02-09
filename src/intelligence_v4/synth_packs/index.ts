import fs from "node:fs";
import path from "node:path";

import type { DataPackStats, DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";
import { normalizeUploadBuffersToDataPack } from "@/src/lib/intelligence/pack_normalizer";

import { emitSynthPack } from "./emit/emit_pack";
import { hashSeed } from "./rng";
import { generateAgencyPack } from "./generators/agency";
import { generateEcommerceOpsPack } from "./generators/ecommerce_ops";
import { generateHomeServicesGenericPack } from "./generators/home_services_generic";
import { generateLogisticsDispatchPack } from "./generators/logistics_dispatch";
import { generateProfessionalServicesPack } from "./generators/professional_services";
import { generateSaasMicroPack } from "./generators/saas_micro";
import {
  SYNTH_INDUSTRIES,
  type GenerateSynthPackParams,
  type GeneratedSynthPack,
  type SynthIndustry,
  type SynthPackManifest,
} from "./schemas";

type GeneratorInput = {
  pack_id: string;
  seed: number;
  window_days: number;
  anchor_date: string;
};

const generatorByIndustry: Record<SynthIndustry, (params: GeneratorInput) => GeneratedSynthPack> = {
  agency: generateAgencyPack,
  saas_micro: generateSaasMicroPack,
  professional_services: generateProfessionalServicesPack,
  ecommerce_ops: generateEcommerceOpsPack,
  logistics_dispatch: generateLogisticsDispatchPack,
  home_services_generic: generateHomeServicesGenericPack,
};

export type SynthPackLoadResult = {
  manifest: SynthPackManifest;
  pack: DataPackV0;
  stats: DataPackStats;
  source_dir: string;
};

function resolveAnchorDate(anchorDate?: string): string {
  if (anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
    return anchorDate;
  }
  return new Date().toISOString().slice(0, 10);
}

function isSynthIndustry(value: string): value is SynthIndustry {
  return (SYNTH_INDUSTRIES as readonly string[]).includes(value);
}

export function parseIndustryList(raw: string | undefined): SynthIndustry[] {
  if (!raw || raw.trim().length === 0) return [...SYNTH_INDUSTRIES];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is SynthIndustry => isSynthIndustry(value));
}

export function generateSynthPack(params: GenerateSynthPackParams): GeneratedSynthPack {
  const generator = generatorByIndustry[params.industry];
  return generator({
    pack_id: params.pack_id,
    seed: params.seed,
    window_days: params.window_days,
    anchor_date: resolveAnchorDate(params.anchor_date),
  });
}

export function generateSynthPacks(params: {
  out_dir: string;
  industries: SynthIndustry[];
  packs_per_industry: number;
  seed: number;
  window_days: number;
  anchor_date?: string;
}): Array<{
  industry: SynthIndustry;
  pack_id: string;
  out_dir: string;
}> {
  const generated: Array<{ industry: SynthIndustry; pack_id: string; out_dir: string }> = [];
  const anchorDate = resolveAnchorDate(params.anchor_date);

  for (const industry of params.industries) {
    for (let i = 0; i < params.packs_per_industry; i += 1) {
      const packSeed = hashSeed(params.seed, `${industry}:${i}`);
      const packId = `${industry}_seed${params.seed}_${String(i + 1).padStart(2, "0")}`;
      const pack = generateSynthPack({
        pack_id: packId,
        industry,
        seed: packSeed,
        window_days: params.window_days,
        anchor_date: anchorDate,
      });

      const outDir = path.resolve(params.out_dir, industry, packId);
      emitSynthPack(pack, outDir);
      generated.push({ industry, pack_id: packId, out_dir: outDir });
    }
  }

  return generated;
}

export function discoverSynthPackDirectories(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];

  const found: string[] = [];
  const stack = [path.resolve(rootDir)];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const manifestPath = path.join(current, "pack.json");
    if (fs.existsSync(manifestPath)) {
      found.push(current);
      continue;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      }
    }
  }

  return found.sort((a, b) => a.localeCompare(b));
}

export async function loadSynthPackFromDirectory(packDir: string): Promise<SynthPackLoadResult> {
  const manifestPath = path.resolve(packDir, "pack.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`pack.json not found in ${packDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SynthPackManifest;
  if (!manifest || typeof manifest !== "object" || !manifest.industry || !isSynthIndustry(manifest.industry)) {
    throw new Error(`Invalid synth pack manifest in ${manifestPath}`);
  }

  const inputFiles: Array<{ filename: string; buffer: Buffer }> = [];
  for (const filename of ["estimates.csv", "invoices.csv", "schedule.csv"]) {
    const filePath = path.resolve(packDir, filename);
    if (!fs.existsSync(filePath)) continue;
    inputFiles.push({ filename, buffer: fs.readFileSync(filePath) });
  }

  if (inputFiles.length < 2) {
    throw new Error(`Synth pack ${packDir} must include at least estimates.csv and invoices.csv.`);
  }

  const { pack, stats } = await normalizeUploadBuffersToDataPack(inputFiles, `synth_${manifest.industry}`);

  return {
    manifest,
    pack,
    stats,
    source_dir: packDir,
  };
}

export { SYNTH_INDUSTRIES };
export type { SynthIndustry, SynthPackManifest };
