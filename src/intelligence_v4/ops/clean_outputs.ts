import fs from "node:fs";
import path from "node:path";

import { parseBooleanArg, readCliArg } from "../train/cli_args";
import { resolveSynthShipRoot } from "./ops_paths";

type CleanResult = {
  removed: string[];
  kept: string[];
  dry_run: boolean;
};

function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.resolve(dir, entry.name));
}

function ageDays(filePath: string): number {
  const stat = fs.statSync(filePath);
  const deltaMs = Date.now() - stat.mtimeMs;
  return deltaMs / (24 * 60 * 60 * 1000);
}

function main() {
  const all = parseBooleanArg(readCliArg(process.argv.slice(2), "all"), false);
  const dry_run = parseBooleanArg(readCliArg(process.argv.slice(2), "dry_run"), false);
  const keep_days = Math.max(1, Number(readCliArg(process.argv.slice(2), "keep_days") ?? 14));

  const targets = [resolveSynthShipRoot()];
  const removed: string[] = [];
  const kept: string[] = [];

  for (const target of targets) {
    for (const dir of listDirs(target)) {
      const shouldRemove = all || ageDays(dir) >= keep_days;
      if (!shouldRemove) {
        kept.push(dir);
        continue;
      }

      if (!dry_run) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      removed.push(dir);
    }
  }

  const result: CleanResult = {
    removed,
    kept,
    dry_run,
  };

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.includes("clean_outputs.ts")) {
  main();
}
