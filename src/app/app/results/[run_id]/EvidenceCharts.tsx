"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type WeeklyVolumePoint = { week_start: string; quotes: number; invoices: number };
type BucketPoint = { bucket: string; count: number };

type EvidenceChartsProps = {
  weeklyVolumeSeries?: WeeklyVolumePoint[];
  invoiceSizeBuckets?: BucketPoint[];
  quoteAgeBuckets?: BucketPoint[];
};

function formatWeekLabel(value: string) {
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  } catch {
    return value;
  }
}

export function EvidenceCharts({
  weeklyVolumeSeries,
  invoiceSizeBuckets,
  quoteAgeBuckets,
}: EvidenceChartsProps) {
  const weekly = weeklyVolumeSeries ?? [];
  const invoiceBuckets = invoiceSizeBuckets ?? [];
  const quoteBuckets = quoteAgeBuckets ?? [];
  const hasWeekly = weekly.some((point) => point.quotes > 0 || point.invoices > 0);
  const hasInvoiceBuckets = invoiceBuckets.some((bucket) => bucket.count > 0);
  const hasQuoteBuckets = quoteBuckets.some((bucket) => bucket.count > 0);

  return (
    <div className="space-y-6">
      {weekly.length > 0 && hasWeekly && (
        <div className="space-y-2">
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="week_start" tickFormatter={formatWeekLabel} fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="quotes" stroke="#0f172a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="invoices" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">
            Weekly quote and invoice rhythm. Spiky weeks can hint at fragility in planning.
          </p>
        </div>
      )}

      {invoiceBuckets.length > 0 && hasInvoiceBuckets && (
        <div className="space-y-2">
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={invoiceBuckets} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="bucket" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">
            Invoice size distribution. Concentration here can amplify pressure when one job moves.
          </p>
        </div>
      )}

      {quoteBuckets.length > 0 && hasQuoteBuckets && (
        <div className="space-y-2">
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={quoteBuckets} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="bucket" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#ea580c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">
            Quote age distribution. Older quotes often indicate follow-up drift.
          </p>
        </div>
      )}
    </div>
  );
}
