import path from "node:path";

import {
  generateSynthPacks,
  parseIndustryList,
  SYNTH_INDUSTRIES,
  type SynthIndustry,
} from "@/src/intelligence_v4/synth_packs";
import { readCliArg } from "@/src/intelligence_v4/train/cli_args";

type CliArgs = {
  out_dir: string;
  industries: SynthIndustry[];
  packs_per_industry: number;
  seed: number;
  window_days: number;
  anchor_date?: string;
};

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseArgs(argv: string[]): CliArgs {
  const outDir = path.resolve(
    readCliArg(argv, "out_dir") ??
      path.resolve(process.cwd(), "src", "intelligence_v4", "evals", "fixtures_synth")
  );

  const industries = parseIndustryList(
    readCliArg(argv, "industries") ?? SYNTH_INDUSTRIES.join(",")
  );

  if (industries.length === 0) {
    throw new Error(
      `No valid industries supplied. Supported values: ${SYNTH_INDUSTRIES.join(", ")}`
    );
  }

  return {
    out_dir: outDir,
    industries,
    packs_per_industry: Math.max(1, Math.floor(parseNumber(readCliArg(argv, "packs_per_industry"), 3))),
    seed: Math.max(1, Math.floor(parseNumber(readCliArg(argv, "seed"), 1234))),
    window_days: Math.max(30, Math.floor(parseNumber(readCliArg(argv, "window_days"), 90))),
    anchor_date: readCliArg(argv, "anchor_date") ?? undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generated = generateSynthPacks(args);

  const summary = {
    out_dir: args.out_dir,
    industries: args.industries,
    packs_per_industry: args.packs_per_industry,
    total_generated: generated.length,
    generated,
  };

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1]?.includes("generate_synth_packs.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
