"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BaselineProfile, CompanyProfile, DecisionLagBucket, MoneyBucket } from "@/lib/snapshot/schema";
import { DECISION_LAG_BUCKETS, MONEY_BUCKETS } from "@/lib/snapshot/schema";

function pct(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function axisPctTick(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return pct(Number.isFinite(n) ? n : 0);
}

export default function SnapshotCharts(props: {
  company: CompanyProfile;
  baseline: BaselineProfile;
  print?: boolean;
}) {
  const print = Boolean(props.print);

  const jobValueData = MONEY_BUCKETS.map((bucket: MoneyBucket) => ({
    bucket,
    Baseline: props.baseline.job_value_distribution[bucket],
    "This business": props.company.job_value_distribution[bucket],
  }));

  const decisionLagData = DECISION_LAG_BUCKETS.map((bucket: DecisionLagBucket) => ({
    bucket: bucket.replace(/_/g, " "),
    Baseline: props.baseline.decision_lag_distribution[bucket],
    "This business": props.company.decision_lag_distribution[bucket],
  }));

  const concentrationData = [
    {
      bucket: "Top 10% jobs",
      Baseline: props.baseline.revenue_concentration.top_10_percent_jobs_share,
      "This business": props.company.revenue_concentration.top_10_percent_jobs_share,
    },
    {
      bucket: "Top 25% jobs",
      Baseline: props.baseline.revenue_concentration.top_25_percent_jobs_share,
      "This business": props.company.revenue_concentration.top_25_percent_jobs_share,
    },
  ];

  const commonProps = {
    margin: { top: 8, right: 16, left: 0, bottom: 8 },
    barCategoryGap: 10,
  } as const;

  const baselineColor = "hsl(var(--muted-foreground))";
  const companyColor = "hsl(var(--foreground))";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">Job value distribution</div>
        <div className="h-56 w-full rounded-2xl border border-border/60 bg-background/90 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={jobValueData} {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={axisPctTick} tick={{ fontSize: 12 }} />
              {!print ? <Tooltip formatter={(v: number | string) => pct(Number(v))} /> : null}
              <Legend />
              <Bar dataKey="Baseline" fill={baselineColor} isAnimationActive={!print} />
              <Bar dataKey="This business" fill={companyColor} isAnimationActive={!print} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">Decision lag shape</div>
        <div className="h-56 w-full rounded-2xl border border-border/60 bg-background/90 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={decisionLagData} {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} interval={0} height={50} />
              <YAxis tickFormatter={axisPctTick} tick={{ fontSize: 12 }} />
              {!print ? <Tooltip formatter={(v: number | string) => pct(Number(v))} /> : null}
              <Legend />
              <Bar dataKey="Baseline" fill={baselineColor} isAnimationActive={!print} />
              <Bar dataKey="This business" fill={companyColor} isAnimationActive={!print} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">Revenue concentration</div>
        <div className="h-56 w-full rounded-2xl border border-border/60 bg-background/90 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={concentrationData} {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={axisPctTick} tick={{ fontSize: 12 }} />
              {!print ? <Tooltip formatter={(v: number | string) => pct(Number(v))} /> : null}
              <Legend />
              <Bar dataKey="Baseline" fill={baselineColor} isAnimationActive={!print} />
              <Bar dataKey="This business" fill={companyColor} isAnimationActive={!print} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
