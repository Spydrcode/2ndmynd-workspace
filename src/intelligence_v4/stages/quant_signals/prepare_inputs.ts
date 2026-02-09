import type { DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";

import type { DataLimitsV1, StageConfidence } from "../../pipeline/contracts";

export type BucketSignal = {
  id: string;
  label: string;
  value_bucket: string;
  direction: "up" | "down" | "flat" | "mixed" | "unknown";
  confidence: StageConfidence;
  evidence_ref: string;
};

export type QuantPreparedInputs = {
  window: {
    start_date: string;
    end_date: string;
    mode: "last_90_days" | "last_100_closed_estimates";
  };
  data_limits: DataLimitsV1;
  buckets: BucketSignal[];
  evidence_catalog: Record<string, string>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function clampBucket(value: number, thresholds: [number, number], labels: [string, string, string]) {
  if (value <= thresholds[0]) return labels[0];
  if (value <= thresholds[1]) return labels[1];
  return labels[2];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function variance(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squared = values.reduce((sum, value) => sum + (value - avg) ** 2, 0);
  return squared / (values.length - 1);
}

function stableEvidenceRef(id: string, bucket: string): string {
  const normalizedBucket = bucket.toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  return `bucket:${id}:${normalizedBucket}`;
}

function revenueConcentrationBucket(values: number[]): string {
  if (values.length === 0) return "unknown";
  const sorted = [...values].sort((a, b) => b - a);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return "unknown";
  const top5 = sorted.slice(0, 5).reduce((sum, value) => sum + value, 0);
  const share = top5 / total;
  return clampBucket(share, [0.35, 0.6], ["low", "medium", "high"]);
}

function volatilityBucket(series: number[]): string {
  if (series.length < 4) return "unknown";
  const avg = series.reduce((sum, value) => sum + value, 0) / series.length;
  if (avg <= 0) return "unknown";
  const coeffVar = Math.sqrt(variance(series)) / avg;
  return clampBucket(coeffVar, [0.25, 0.5], ["low", "medium", "high"]);
}

function seasonalityBucket(monthCounts: Map<number, number>): string {
  const values = [...monthCounts.values()];
  if (values.length < 3) return "none";
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === 0) return "none";
  const spread = min === 0 ? max : max / min;
  if (spread < 1.4) return "none";
  if (spread < 2.0) return "weak";
  return "strong";
}

function decisionLagBucket(quotes: DataPackV0["quotes"]): string {
  const lags: number[] = [];
  for (const quote of quotes ?? []) {
    const created = parseDate(quote.created_at);
    const approved = parseDate(quote.approved_at);
    if (!created || !approved) continue;
    const lag = Math.max(0, (approved.getTime() - created.getTime()) / DAY_MS);
    lags.push(lag);
  }
  if (lags.length === 0) return "unknown";
  const lagMedian = median(lags);
  return clampBucket(lagMedian, [3, 10], ["low", "medium", "high"]);
}

function capacitySqueezeBucket(pack: DataPackV0): string {
  const jobs = pack.jobs ?? [];
  if (jobs.length > 0) {
    const scheduled = jobs.filter((job) => Boolean(job.scheduled_at)).length;
    const completed = jobs.filter((job) => Boolean(job.completed_at)).length;
    if (scheduled === 0) return "unknown";
    const completionRatio = completed / scheduled;
    if (completionRatio >= 0.85) return "low";
    if (completionRatio >= 0.65) return "medium";
    return "high";
  }

  const weeklyVolumes: number[] = [];
  const quotes = pack.quotes ?? [];
  const invoices = pack.invoices ?? [];
  const byWeek = new Map<string, number>();

  for (const quote of quotes) {
    const created = parseDate(quote.created_at);
    if (!created) continue;
    const key = `${created.getUTCFullYear()}-${Math.ceil((created.getUTCDate() + created.getUTCMonth() * 30) / 7)}`;
    byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
  }

  for (const invoice of invoices) {
    const issued = parseDate(invoice.issued_at);
    if (!issued) continue;
    const key = `${issued.getUTCFullYear()}-${Math.ceil((issued.getUTCDate() + issued.getUTCMonth() * 30) / 7)}`;
    byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
  }

  weeklyVolumes.push(...byWeek.values());
  const bucket = volatilityBucket(weeklyVolumes);
  if (bucket === "high") return "high";
  if (bucket === "medium") return "medium";
  if (bucket === "low") return "low";
  return "unknown";
}

function countCoverageDates(pack: DataPackV0): Date[] {
  const dates: Date[] = [];
  for (const quote of pack.quotes ?? []) {
    const created = parseDate(quote.created_at);
    if (created) dates.push(created);
  }
  for (const invoice of pack.invoices ?? []) {
    const issued = parseDate(invoice.issued_at);
    if (issued) dates.push(issued);
  }
  for (const job of pack.jobs ?? []) {
    const scheduled = parseDate(job.scheduled_at);
    if (scheduled) dates.push(scheduled);
  }
  return dates;
}

function resolveWindow(pack: DataPackV0, mode: "last_90_days" | "last_100_closed_estimates") {
  const now = new Date();

  if (mode === "last_100_closed_estimates") {
    const closedQuotes = (pack.quotes ?? [])
      .filter((quote) => quote.status === "approved" || Boolean(quote.approved_at))
      .map((quote) => parseDate(quote.approved_at) ?? parseDate(quote.created_at))
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime());

    if (closedQuotes.length > 0) {
      const slice = closedQuotes.slice(Math.max(0, closedQuotes.length - 100));
      return {
        start: slice[0],
        end: slice[slice.length - 1],
      };
    }
  }

  const dates = countCoverageDates(pack);
  const end = dates.length > 0 ? new Date(Math.max(...dates.map((value) => value.getTime()))) : now;
  const start = new Date(end.getTime() - 89 * DAY_MS);
  return { start, end };
}

function weeklySeries(pack: DataPackV0, start: Date, end: Date): number[] {
  const bucket = new Map<string, number>();

  const register = (date: Date) => {
    if (date < start || date > end) return;
    const week = `${date.getUTCFullYear()}-${Math.ceil((date.getUTCDate() + date.getUTCMonth() * 30) / 7)}`;
    bucket.set(week, (bucket.get(week) ?? 0) + 1);
  };

  for (const quote of pack.quotes ?? []) {
    const created = parseDate(quote.created_at);
    if (created) register(created);
  }

  for (const invoice of pack.invoices ?? []) {
    const issued = parseDate(invoice.issued_at);
    if (issued) register(issued);
  }

  return [...bucket.values()];
}

function monthSeries(pack: DataPackV0, start: Date, end: Date): Map<number, number> {
  const bucket = new Map<number, number>();
  const register = (date: Date) => {
    if (date < start || date > end) return;
    const month = date.getUTCMonth();
    bucket.set(month, (bucket.get(month) ?? 0) + 1);
  };

  for (const quote of pack.quotes ?? []) {
    const created = parseDate(quote.created_at);
    if (created) register(created);
  }
  for (const invoice of pack.invoices ?? []) {
    const issued = parseDate(invoice.issued_at);
    if (issued) register(issued);
  }

  return bucket;
}

function confidenceFromRows(rowCount: number): StageConfidence {
  if (rowCount >= 120) return "high";
  if (rowCount >= 40) return "medium";
  return "low";
}

export function prepareQuantInputs(params: {
  pack: DataPackV0;
  mode: "last_90_days" | "last_100_closed_estimates";
}): QuantPreparedInputs {
  const { pack, mode } = params;
  const window = resolveWindow(pack, mode);
  const startIso = toIsoDate(window.start);
  const endIso = toIsoDate(window.end);

  const totals = {
    quotes: (pack.quotes ?? []).filter((quote) => {
      const created = parseDate(quote.created_at);
      return created ? created >= window.start && created <= window.end : false;
    }),
    invoices: (pack.invoices ?? []).filter((invoice) => {
      const issued = parseDate(invoice.issued_at);
      return issued ? issued >= window.start && issued <= window.end : false;
    }),
  };

  const quoteTotals = totals.quotes.map((quote) => quote.total ?? 0).filter((value) => value > 0);
  const invoiceTotals = totals.invoices.map((invoice) => invoice.total ?? 0).filter((value) => value > 0);

  const weekly = weeklySeries(pack, window.start, window.end);
  const months = monthSeries(pack, window.start, window.end);

  const concentration = revenueConcentrationBucket(quoteTotals.length > 0 ? quoteTotals : invoiceTotals);
  const volatility = volatilityBucket(weekly);
  const seasonality = seasonalityBucket(months);
  const decisionLag = decisionLagBucket(totals.quotes);
  const capacitySqueeze = capacitySqueezeBucket(pack);

  const totalRows = totals.quotes.length + totals.invoices.length;
  const confidence = confidenceFromRows(totalRows);

  const bucketDefs: Array<{ id: string; label: string; bucket: string; direction: BucketSignal["direction"] }> = [
    {
      id: "revenue_concentration_top5",
      label: "Top-5 revenue concentration",
      bucket: concentration,
      direction: concentration === "high" ? "up" : concentration === "low" ? "down" : "flat",
    },
    {
      id: "volatility",
      label: "Workload volatility",
      bucket: volatility,
      direction: volatility === "high" ? "up" : volatility === "low" ? "down" : "flat",
    },
    {
      id: "seasonality",
      label: "Seasonality signal",
      bucket: seasonality,
      direction: seasonality === "strong" ? "up" : seasonality === "none" ? "flat" : "mixed",
    },
    {
      id: "decision_latency",
      label: "Quote decision latency",
      bucket: decisionLag,
      direction: decisionLag === "high" ? "up" : decisionLag === "low" ? "down" : "flat",
    },
    {
      id: "capacity_squeeze_proxy",
      label: "Capacity squeeze proxy",
      bucket: capacitySqueeze,
      direction: capacitySqueeze === "high" ? "up" : capacitySqueeze === "low" ? "down" : "flat",
    },
    {
      id: "lead_source",
      label: "Lead source concentration",
      bucket: "not_available",
      direction: "unknown",
    },
  ];

  const evidence_catalog: Record<string, string> = {};
  const buckets: BucketSignal[] = bucketDefs.map((entry) => {
    const ref = stableEvidenceRef(entry.id, entry.bucket);
    evidence_catalog[ref] = `${entry.label}: ${entry.bucket}`;
    return {
      id: entry.id,
      label: entry.label,
      value_bucket: entry.bucket,
      direction: entry.direction,
      confidence,
      evidence_ref: ref,
    };
  });

  return {
    window: {
      start_date: startIso,
      end_date: endIso,
      mode,
    },
    data_limits: {
      window_mode: mode,
      row_limit_applied: mode === "last_100_closed_estimates" ? 100 : 90,
      saw_quotes: (pack.quotes ?? []).length > 0,
      saw_invoices: (pack.invoices ?? []).length > 0,
      saw_jobs: (pack.jobs ?? []).length > 0,
      saw_customers: (pack.customers ?? []).length > 0,
      notes: [
        `Window: ${startIso}..${endIso}`,
        `Rows in window: ${totalRows}`,
      ],
    },
    buckets,
    evidence_catalog,
  };
}