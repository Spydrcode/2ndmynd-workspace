import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

import { bandByQuantiles, volatilityBand } from "./bucketing";
import { SnapshotV1 } from "./transformer_types";

function readCsv(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  return parse(raw, { columns: true, skip_empty_lines: true });
}

function collectCsvFiles(dir: string) {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCsvFiles(fullPath));
    } else if (entry.name.toLowerCase().endsWith(".csv")) {
      files.push(fullPath);
    }
  }
  return files;
}

function pickNumber(row: any, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

export function transformCallCenter(inputDir: string): SnapshotV1[] {
  if (!fs.existsSync(inputDir)) {
    console.warn(`missing call center input at ${inputDir}`);
    return [];
  }

  const rows = fs.statSync(inputDir).isDirectory()
    ? collectCsvFiles(inputDir).flatMap((file) => readCsv(file))
    : readCsv(inputDir);
  const waitTimes: number[] = [];
  const abandonFlags: number[] = [];
  const arrivals: number[] = [];

  for (const row of rows) {
    const wait = pickNumber(row, [
      "Average Speed of Answer",
      "Speed of Answer",
      "Wait Time",
      "AvgWaitingTime",
      "AvgWaitTime",
    ]);
    if (wait !== null) waitTimes.push(wait);

    const abandoned = pickNumber(row, ["Abandoned", "Calls Abandoned", "Abandon"]);
    const offered = pickNumber(row, ["Calls Offered", "Offered", "Total Calls"]);
    if (abandoned !== null && offered !== null && offered > 0) {
      abandonFlags.push(abandoned / offered);
    }

    const arrivalsCount = pickNumber(row, ["Calls Offered", "Total Calls", "Calls"]);
    if (arrivalsCount !== null) arrivals.push(arrivalsCount);
  }

  const waitBand = bandByQuantiles(waitTimes);
  const abandonRate =
    abandonFlags.length > 0
      ? abandonFlags.reduce((sum, v) => sum + v, 0) / abandonFlags.length
      : 0;
  const abandonBand = abandonRate > 0.2 ? "high" : abandonRate > 0.1 ? "medium" : "low";
  const spikiness = volatilityBand(arrivals);

  const snapshot: SnapshotV1 = {
    snapshot_version: "snapshot_v1",
    pii_scrubbed: true,
    signals: {
      "demand.arrival_spikiness.band": spikiness,
      "pipeline.unanswered_rate.band": abandonBand,
      "schedule.queue_pressure.band": waitBand,
    },
  };

  return [snapshot];
}
