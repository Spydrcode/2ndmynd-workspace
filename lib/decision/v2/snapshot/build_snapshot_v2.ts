import {
  SnapshotV2,
  VolatilityBand,
  SeasonPhase,
  SeasonStrength,
  SeasonPredictability,
} from "../conclusion_schema_v2";

export type RawQuote = {
  created_at?: string;
  approved_at?: string;
  status?: string;
  total?: number;
};

export type RawInvoice = {
  issued_at?: string;
  paid_at?: string;
  status?: string;
  total?: number;
};

export type InputCostSignal = {
  name: string;
  unit: string;
  current: number;
  change_30d_pct: number;
  change_90d_pct: number;
  volatility_band: VolatilityBand;
};

export type BuildSnapshotV2Input = {
  quotes: RawQuote[];
  invoices: RawInvoice[];
  input_costs?: InputCostSignal[];
  report_date?: string;
  lookback_days?: number;
};

function parseDate(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function clampBand(x: number, thresholds: [number, number, number, number]): VolatilityBand {
  if (x <= thresholds[0]) return "very_low";
  if (x <= thresholds[1]) return "low";
  if (x <= thresholds[2]) return "medium";
  if (x <= thresholds[3]) return "high";
  return "very_high";
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base] ?? sorted[sorted.length - 1];
  const b = sorted[base + 1] ?? a;
  return a + rest * (b - a);
}

function bucketByWeek(dates: Date[]) {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const year = date.getUTCFullYear();
    const week = Math.floor(
      (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
        Date.UTC(date.getUTCFullYear(), 0, 1)) /
        (7 * 24 * 60 * 60 * 1000)
    );
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = Array.from(counts.keys()).sort();
  return keys.map((key) => counts.get(key) ?? 0);
}

function computeSeason(buckets: number[]) {
  if (buckets.length === 0) {
    return { phase: "Active", strength: "weak", predictability: "low" } as {
      phase: SeasonPhase;
      strength: SeasonStrength;
      predictability: SeasonPredictability;
    };
  }
  const mean = buckets.reduce((a, b) => a + b, 0) / buckets.length;
  const min = Math.min(...buckets);
  const max = Math.max(...buckets);
  const amplitude = mean > 0 ? (max - min) / mean : 0;
  const last = buckets[buckets.length - 1];

  let phase: SeasonPhase = "Active";
  if (mean > 0 && last >= mean * 1.15) phase = "Peak";
  else if (mean > 0 && last <= mean * 0.85) phase = "Lower";
  else if (buckets.length >= 2 && last > buckets[buckets.length - 2]) phase = "Rising";

  let strength: SeasonStrength = "weak";
  if (amplitude > 0.6) strength = "strong";
  else if (amplitude > 0.3) strength = "moderate";

  const variance =
    buckets.length > 1
      ? buckets.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / (buckets.length - 1)
      : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  let predictability: SeasonPredictability = "low";
  if (cv < 0.25) predictability = "high";
  else if (cv < 0.5) predictability = "medium";

  return { phase, strength, predictability };
}

export function buildSnapshotV2(input: BuildSnapshotV2Input): SnapshotV2 {
  const reportDate = input.report_date ? new Date(input.report_date) : new Date();
  const lookback = input.lookback_days ?? 90;
  const sliceEnd = reportDate;
  const sliceStart = new Date(reportDate.getTime() - lookback * 24 * 60 * 60 * 1000);

  const quotes = input.quotes ?? [];
  const invoices = input.invoices ?? [];

  const quoteItems = quotes
    .map((q) => ({
      created: parseDate(q.created_at),
      approved: parseDate(q.approved_at),
      status: (q.status ?? "").toLowerCase(),
      total: Number.isFinite(q.total ?? NaN) ? (q.total as number) : 0,
    }))
    .filter((q) => (q.created ? q.created >= sliceStart && q.created <= sliceEnd : false));

  const invoiceItems = invoices
    .map((inv) => ({
      issued: parseDate(inv.issued_at),
      paid: parseDate(inv.paid_at),
      status: (inv.status ?? "").toLowerCase(),
      total: Number.isFinite(inv.total ?? NaN) ? (inv.total as number) : 0,
    }))
    .filter((inv) => (inv.issued ? inv.issued >= sliceStart && inv.issued <= sliceEnd : false));

  const quotesCount = quoteItems.length;
  const quotesApprovedCount = quoteItems.filter((q) => q.status.includes("approved") || q.status.includes("converted") || q.approved).length;
  const approvalRate = quotesCount > 0 ? quotesApprovedCount / quotesCount : 0;
  const approvalRateBand = clampBand(approvalRate, [0.1, 0.3, 0.6, 0.85]);

  const decisionLagDays = quoteItems
    .map((q) =>
      q.created && q.approved ? (q.approved.getTime() - q.created.getTime()) / (24 * 60 * 60 * 1000) : null
    )
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const lagMedian = decisionLagDays.length
    ? [...decisionLagDays].sort((a, b) => a - b)[Math.floor(decisionLagDays.length / 2)]
    : 0;
  const decisionLagBand = clampBand(lagMedian, [1, 3, 7, 14]);

  const quoteTotals = quoteItems.map((q) => q.total).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const quoteQ1 = quantile(quoteTotals, 0.33);
  const quoteQ2 = quantile(quoteTotals, 0.66);
  const quoteBands = {
    small: quoteItems.filter((q) => q.total > 0 && q.total <= quoteQ1).length,
    medium: quoteItems.filter((q) => q.total > quoteQ1 && q.total <= quoteQ2).length,
    large: quoteItems.filter((q) => q.total > quoteQ2).length,
  };

  const invoicesCount = invoiceItems.length;
  const invoicesPaidCount = invoiceItems.filter((inv) => inv.status.includes("paid") || inv.paid).length;

  const invoiceTotals = invoiceItems.map((i) => i.total).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const invoiceQ1 = quantile(invoiceTotals, 0.33);
  const invoiceQ2 = quantile(invoiceTotals, 0.66);
  const invoiceBands = {
    small: invoiceItems.filter((i) => i.total > 0 && i.total <= invoiceQ1).length,
    medium: invoiceItems.filter((i) => i.total > invoiceQ1 && i.total <= invoiceQ2).length,
    large: invoiceItems.filter((i) => i.total > invoiceQ2).length,
  };

  const paymentLagDays = invoiceItems
    .map((inv) =>
      inv.issued && inv.paid ? (inv.paid.getTime() - inv.issued.getTime()) / (24 * 60 * 60 * 1000) : null
    )
    .filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);
  const paymentLagDist = { very_low: 0, low: 0, medium: 0, high: 0, very_high: 0 };
  for (const d of paymentLagDays) {
    const band = clampBand(d, [1, 3, 7, 21]);
    paymentLagDist[band] += 1;
  }

  const dayTotals = new Map<string, number>();
  for (const inv of invoiceItems) {
    if (!inv.issued) continue;
    const day = toISODate(inv.issued);
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + (inv.total || 0));
  }
  for (const quote of quoteItems) {
    if (!quote.created) continue;
    const day = toISODate(quote.created);
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + (quote.total || 0));
  }
  const daily = [...dayTotals.values()];
  const mean = daily.length ? daily.reduce((a, b) => a + b, 0) / daily.length : 0;
  const variance =
    daily.length > 1 ? daily.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / (daily.length - 1) : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  const volatilityBand = clampBand(cv, [0.1, 0.25, 0.5, 0.9]);

  const activityDates = [
    ...quoteItems.map((q) => q.created).filter(Boolean),
    ...invoiceItems.map((i) => i.issued).filter(Boolean),
  ] as Date[];
  const season = computeSeason(bucketByWeek(activityDates));

  const totalSignals = quotesCount + invoicesCount;
  const sampleConfidence = totalSignals >= 50 ? "high" : totalSignals >= 20 ? "medium" : "low";

  return {
    snapshot_version: "snapshot_v2",
    pii_scrubbed: true,
    window: {
      slice_start: toISODate(sliceStart),
      slice_end: toISODate(sliceEnd),
      report_date: toISODate(reportDate),
      lookback_days: lookback,
      sample_confidence: sampleConfidence,
    },
    activity_signals: {
      quotes: {
        quotes_count: quotesCount,
        quotes_approved_count: quotesApprovedCount,
        approval_rate_band: approvalRateBand,
        decision_lag_band: decisionLagBand,
        quote_total_bands: quoteBands,
      },
      invoices: {
        invoices_count: invoicesCount,
        invoices_paid_count: invoicesPaidCount,
        invoice_total_bands: invoiceBands,
        payment_lag_band_distribution: paymentLagDist,
      },
    },
    volatility_band: volatilityBand,
    season,
    input_costs: (input.input_costs ?? []).slice(0, 5),
  };
}
