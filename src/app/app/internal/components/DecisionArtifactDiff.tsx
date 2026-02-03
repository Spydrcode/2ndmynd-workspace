"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DecisionArtifactV1 } from "@/src/lib/types/decision_artifact";

type DiffProps = {
  left: DecisionArtifactV1;
  right: DecisionArtifactV1;
  leftLabel?: string;
  rightLabel?: string;
};

function DiffBlock({
  title,
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  title: string;
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
}) {
  const changed = left !== right;
  return (
    <Card className="rounded-2xl border border-border/60 bg-background/90">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className={`rounded-md border p-3 text-sm ${changed ? "bg-amber-50/60" : ""}`}>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{leftLabel}</span>
            {changed ? <Badge variant="outline">changed</Badge> : null}
          </div>
          <p className="whitespace-pre-wrap">{left}</p>
        </div>
        <div className={`rounded-md border p-3 text-sm ${changed ? "bg-amber-50/60" : ""}`}>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{rightLabel}</span>
            {changed ? <Badge variant="outline">changed</Badge> : null}
          </div>
          <p className="whitespace-pre-wrap">{right}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatList(list: string[]) {
  if (!list.length) return "\u2014";
  return list.map((item) => `\u2022 ${item}`).join("\n");
}

function formatPressureMap(artifact: DecisionArtifactV1) {
  if (!artifact.pressure_map?.length) return "\u2014";
  return artifact.pressure_map
    .map((item) => `${item.key}: ${item.sentence}`)
    .join("\n");
}

function formatBenchmarks(artifact: DecisionArtifactV1) {
  const metrics = artifact.benchmarks?.metrics ?? [];
  if (!metrics.length) return "\u2014";
  return metrics
    .map((metric) => `${metric.label}: ${metric.value}${metric.unit} (${metric.percentile}th)`)
    .join("\n");
}

export function DecisionArtifactDiff({
  left,
  right,
  leftLabel = "Baseline",
  rightLabel = "Learned",
}: DiffProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{leftLabel}</Badge>
        <span>vs</span>
        <Badge variant="outline">{rightLabel}</Badge>
      </div>

      <DiffBlock
        title="One clear takeaway"
        left={left.takeaway}
        right={right.takeaway}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
      />

      <DiffBlock
        title="Why it likely feels heavy"
        left={left.why_heavy}
        right={right.why_heavy}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
      />

      <DiffBlock
        title="What to do next (7 days)"
        left={formatList(left.next_7_days)}
        right={formatList(right.next_7_days)}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
      />

      <DiffBlock
        title="Boundary"
        left={left.boundary ?? "\u2014"}
        right={right.boundary ?? "\u2014"}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
      />

      <Separator />

      <DiffBlock
        title="Pressure map"
        left={formatPressureMap(left)}
        right={formatPressureMap(right)}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
      />

      <DiffBlock
        title="Benchmarks"
        left={formatBenchmarks(left)}
        right={formatBenchmarks(right)}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
      />
    </div>
  );
}
