import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

import { bandByQuantiles, trendBand } from "./bucketing";
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

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function transformRetailSales(inputDir: string): SnapshotV1[] {
  if (!fs.existsSync(inputDir)) {
    console.warn(`missing retail sales input at ${inputDir}`);
    return [];
  }

  const rows = readCsvFiles(inputDir);
  const totals: number[] = [];
  const dates: Date[] = [];
  const countsByDate = new Map<string, number>();
  const totalsByDate = new Map<string, number>();

  for (const row of rows) {
    const quantity = pickNumber(row, ["Quantity", "quantity", "Qty"]);
    const unitPrice = pickNumber(row, ["UnitPrice", "unit_price", "Price", "price"]);
    const total = pickNumber(row, ["Total", "total", "Amount", "amount"]);
    const computedTotal =
      total ?? (quantity !== null && unitPrice !== null ? quantity * unitPrice : null);
    if (computedTotal !== null) totals.push(computedTotal);

    const dateValue = row.InvoiceDate ?? row.Date ?? row.OrderDate ?? row.order_date;
    const date = dateValue ? parseDate(dateValue) : null;
    if (date && computedTotal !== null) {
      const key = date.toISOString().slice(0, 10);
      countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
      totalsByDate.set(key, (totalsByDate.get(key) ?? 0) + computedTotal);
    }
  }

  const dateKeys = Array.from(countsByDate.keys()).sort();
  const countSeries = dateKeys.map((key) => countsByDate.get(key) ?? 0);
  const avgTicketSeries = dateKeys.map((key) => {
    const count = countsByDate.get(key) ?? 1;
    return (totalsByDate.get(key) ?? 0) / count;
  });

  const jobCountTrend = trendBand(countSeries);
  const avgTicketTrend = trendBand(avgTicketSeries);
  const lowValueShare =
    totals.length > 0
      ? totals.filter((value) => value <= totals[Math.floor(totals.length * 0.33)]).length /
        totals.length
      : 0;
  const lowValueBand =
    lowValueShare > 0.45 ? "high" : lowValueShare > 0.3 ? "medium" : "low";

  const completionProxyBand = bandByQuantiles(avgTicketSeries);

  const snapshot: SnapshotV1 = {
    snapshot_version: "snapshot_v1",
    pii_scrubbed: true,
    signals: {
      "demand.job_count_trend.band": jobCountTrend,
      "demand.avg_ticket_trend.band": avgTicketTrend,
      "mix.low_value_job_share.band": lowValueBand,
      "ops.completion_proxy.band": completionProxyBand,
    },
  };

  return [snapshot];
}
