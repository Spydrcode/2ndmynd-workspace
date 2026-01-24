import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

import { bandByQuantiles } from "./bucketing";
import { SnapshotV1 } from "./transformer_types";

function readCsv(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  return parse(raw, { columns: true, skip_empty_lines: true });
}

function readCsvFiles(dir: string) {
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".csv"));
  const rows: any[] = [];
  for (const file of files) {
    rows.push(...readCsv(path.join(dir, file)));
  }
  return rows;
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

export function transformLatePaymentHistories(inputDir: string): SnapshotV1[] {
  if (!fs.existsSync(inputDir)) {
    console.warn(`missing late payment input at ${inputDir}`);
    return [];
  }

  const rows = readCsvFiles(inputDir);
  const daysToPaid: number[] = [];
  const lateFlags: number[] = [];
  const disputeFlags: number[] = [];

  for (const row of rows) {
    const days = pickNumber(row, [
      "Days to Pay",
      "DaysToPay",
      "days_to_pay",
      "Days to Paid",
      "DaysLate",
      "days_late",
    ]);
    if (days !== null) daysToPaid.push(days);

    const late = String(row.Late ?? row.late ?? row.LatePayment ?? "").toLowerCase();
    if (late) lateFlags.push(late === "yes" || late === "1" ? 1 : 0);

    const dispute = String(row.Dispute ?? row.dispute ?? "").toLowerCase();
    if (dispute) disputeFlags.push(dispute === "yes" || dispute === "1" ? 1 : 0);
  }

  const daysBand = bandByQuantiles(daysToPaid);
  const lateRate =
    lateFlags.length > 0 ? lateFlags.reduce((sum, v) => sum + v, 0) / lateFlags.length : 0;
  const disputeRate =
    disputeFlags.length > 0
      ? disputeFlags.reduce((sum, v) => sum + v, 0) / disputeFlags.length
      : 0;

  const lateBand = lateRate > 0.25 ? "high" : lateRate > 0.1 ? "medium" : "low";
  const disputeBand = disputeRate > 0.1 ? "high" : disputeRate > 0.04 ? "medium" : "low";

  const snapshot: SnapshotV1 = {
    snapshot_version: "snapshot_v1",
    pii_scrubbed: true,
    signals: {
      "cash.days_to_paid_p90.band": daysBand,
      "cash.late_rate.band": lateBand,
      "cash.dispute_rate.band": disputeBand,
    },
  };

  return [snapshot];
}
