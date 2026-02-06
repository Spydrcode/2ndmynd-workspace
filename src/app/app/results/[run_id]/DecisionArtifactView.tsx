import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { DecisionArtifactV1 } from "@/src/lib/types/decision_artifact";
import { formatBenchmarkInsight } from "@/src/lib/present/benchmark_narratives";
import { getIndustryGroupFromCohort } from "@/src/lib/intelligence/industry_groups";
import { EvidenceCharts } from "./EvidenceCharts";
import type { ArchetypeDetectionResult } from "@/src/lib/intelligence/archetypes/types";

type WatchListItem = {
  topic: string;
  why: string;
  what_to_watch: string;
};

type DecisionArtifactViewProps = {
  artifact: DecisionArtifactV1;
  isDev?: boolean;
  showInternal?: boolean;
  archetypes?: ArchetypeDetectionResult | null;
  watchList?: WatchListItem[];
};

type BenchmarkMetric = NonNullable<DecisionArtifactV1["benchmarks"]>["metrics"][number];

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
  } catch {
    return isoDate;
  }
}

function formatMetricValue(metric: BenchmarkMetric) {
  if (metric.unit === "%") return `${Math.round(metric.value)}%`;
  if (metric.unit === "days") return `${Math.round(metric.value)} days`;
  if (metric.unit === "ratio") return metric.value.toFixed(1);
  return `${metric.value}${metric.unit}`;
}

function formatPeerMedian(metric: BenchmarkMetric) {
  if (metric.unit === "%") return `${Math.round(metric.peer_median)}%`;
  if (metric.unit === "days") return `${Math.round(metric.peer_median)} days`;
  if (metric.unit === "ratio") return metric.peer_median.toFixed(1);
  return `${metric.peer_median}${metric.unit}`;
}

function ConfidenceBadge({ level, reason }: { level: string; reason: string }) {
  const variant = level === "high" ? "default" : level === "medium" ? "secondary" : "outline";
  return (
    <details className="inline-block">
      <summary className="cursor-pointer list-none">
        <Badge variant={variant} className="capitalize">
          {level} confidence
        </Badge>
      </summary>
      <p className="mt-2 max-w-md text-xs text-muted-foreground">{reason}</p>
    </details>
  );
}

function WindowSummary({ window }: { window: DecisionArtifactV1["window"] }) {
  const start = formatDate(window.start_date);
  const end = formatDate(window.end_date);
  const totalExcluded =
    (window.excluded_counts.quotes_outside_window ?? 0) +
    (window.excluded_counts.invoices_outside_window ?? 0) +
    (window.excluded_counts.calendar_outside_window ?? 0);

  return (
    <div className="text-sm text-muted-foreground">
      <p>
        Window: {start} – {end}
        {window.rule !== "custom" && (
          <span className="ml-2 text-xs">
            ({window.rule.replace(/_/g, " ")})
          </span>
        )}
      </p>
      {totalExcluded > 0 && (
        <p className="text-xs">
          {totalExcluded} record{totalExcluded !== 1 ? "s" : ""} excluded (outside window)
        </p>
      )}
    </div>
  );
}

/** Severity color for pressure signal cards */
function pressureSeverityColor(percentile?: number): string {
  if (percentile === undefined) return "border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20";
  if (percentile >= 75) return "border-red-400/60 bg-red-50/40 dark:bg-red-950/20";
  if (percentile >= 50) return "border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20";
  return "border-emerald-400/40 bg-emerald-50/30 dark:bg-emerald-950/20";
}

function pressureSeverityDot(percentile?: number): string {
  if (percentile === undefined) return "bg-amber-400";
  if (percentile >= 75) return "bg-red-500";
  if (percentile >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

/** Visual percentile bar */
function PercentileBar({ percentile, label }: { percentile: number; label: string }) {
  const barColor =
    percentile >= 75 ? "bg-red-500" : percentile >= 50 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-2 w-full max-w-30 overflow-hidden rounded-full bg-muted/40">
        <div
          className={`absolute left-0 top-0 h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(percentile, 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
    </div>
  );
}

/** Archetype label formatting */
function formatArchetypeLabel(id: string): string {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DecisionArtifactView({
  artifact,
  isDev = false,
  showInternal = false,
  archetypes,
  watchList = [],
}: DecisionArtifactViewProps) {
  const evidence = artifact.evidence_summary;
  const visuals = artifact.visuals_summary;
  const opportunities = artifact.website_opportunities ?? [];
  const learningNote = artifact.learning_note;
  const benchmarks = artifact.benchmarks;
  const primaryArchetype = archetypes?.primary
    ? archetypes.archetypes.find((a) => a.id === archetypes.primary)
    : archetypes?.archetypes?.[0];

  return (
    <div className="space-y-6">
      {/* Header: Window + Confidence + Archetype */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <WindowSummary window={artifact.window} />
          {primaryArchetype && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {formatArchetypeLabel(primaryArchetype.id)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                business shape ({primaryArchetype.confidence} confidence)
              </span>
            </div>
          )}
        </div>
        <ConfidenceBadge level={artifact.confidence.level} reason={artifact.confidence.reason} />
      </div>

      {/* Primary Artifact Content */}
      <div className="space-y-6">
        {/* Takeaway - Large */}
        <Card className="rounded-2xl border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">One clear takeaway</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base leading-relaxed text-foreground">{artifact.takeaway}</p>
          </CardContent>
        </Card>

        {/* Next 7 Days - Bullets + Boundary */}
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">What to do next (7 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{artifact.next_7_days[0]}</p>
            {artifact.next_7_days.length > 1 && (
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {artifact.next_7_days.slice(1).map((step, idx) => (
                  <li key={idx} className="leading-relaxed">{step}</li>
                ))}
              </ul>
            )}
            {artifact.boundary && (
              <>
                <Separator />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Boundary:</span>
                  <span className="text-xs italic text-muted-foreground">{artifact.boundary}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── PRESSURE POINTS (VISIBLE by default — core intelligence) ── */}
        {artifact.pressure_map.length > 0 && (
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Where pressure is building</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {artifact.pressure_map.map((signal) => (
                <div
                  key={signal.key}
                  className={`rounded-xl border p-4 ${pressureSeverityColor(signal.percentile)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${pressureSeverityDot(signal.percentile)}`} />
                      <p className="text-sm font-medium text-foreground">{signal.label}</p>
                    </div>
                    {signal.percentile !== undefined && (
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {signal.percentile}th percentile
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 pl-4.5 text-sm text-muted-foreground">{signal.sentence}</p>
                  {signal.percentile !== undefined && (
                    <div className="mt-3 pl-4.5">
                      <PercentileBar
                        percentile={signal.percentile}
                        label={`You vs peers: ${signal.percentile}th`}
                      />
                    </div>
                  )}
                  <div className="mt-3 pl-4.5 rounded-lg bg-background/60 p-3 space-y-1">
                    <p className="text-xs text-foreground">
                      <span className="font-medium">Recommended:</span> {signal.recommended_move}
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      Boundary: {signal.boundary}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Why Heavy */}
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Why it likely feels heavy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{artifact.why_heavy}</p>
          </CardContent>
        </Card>

        {/* ── BENCHMARKS (VISIBLE — "You vs Peers" with visual bars) ── */}
        {benchmarks && (
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">You vs peers</CardTitle>
                <Badge variant="outline" className="text-xs">{benchmarks.cohort_label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {benchmarks.metrics.map((metric) => {
                const industryGroup = getIndustryGroupFromCohort(benchmarks.cohort_label);
                const insight = formatBenchmarkInsight({
                  metric_key: metric.key,
                  value: metric.value,
                  peer_median: metric.peer_median,
                  percentile: metric.percentile,
                  direction: metric.direction,
                  industry_group: industryGroup,
                });
                const barColor =
                  metric.direction === "higher_is_risk"
                    ? metric.percentile >= 75
                      ? "bg-red-500" : metric.percentile >= 50
                        ? "bg-amber-500" : "bg-emerald-500"
                    : metric.percentile <= 25
                      ? "bg-red-500" : metric.percentile <= 50
                        ? "bg-amber-500" : "bg-emerald-500";

                return (
                  <div key={metric.key} className="space-y-2">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{insight.headline}</p>
                      <p className="text-xs text-muted-foreground">{insight.so_what}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/40">
                        <div
                          className={`absolute left-0 top-0 h-full rounded-full ${barColor}`}
                          style={{ width: `${Math.min(metric.percentile, 100)}%` }}
                        />
                        <div
                          className="absolute -top-0.5 h-2.5 w-0.5 bg-foreground/40"
                          style={{ left: "50%" }}
                          title="Peer median"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-28 text-right">
                        {formatMetricValue(metric)} vs {formatPeerMedian(metric)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* ── WATCH LIST (VISIBLE — what might shift) ── */}
        {watchList.length > 0 && (
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                What might shift in the next 30–90 days
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {watchList.map((item) => (
                <div key={item.topic} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                  <p className="text-sm font-medium text-foreground">{item.topic}</p>
                  <p className="text-xs text-muted-foreground">{item.why}</p>
                  <p className="text-xs italic text-muted-foreground">
                    Watch for: {item.what_to_watch}
                  </p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground italic pt-1">
                This is a watch list based on detected patterns — not a forecast.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── WEBSITE OPPORTUNITIES (VISIBLE when present) ── */}
        {opportunities.length > 0 && (
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Website opportunities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {opportunities.map((item, idx) => (
                <div key={`${item.title}-${idx}`} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.why}</p>
                  {item.suggested_tool && (
                    <Badge variant="outline" className="text-xs mt-1">{item.suggested_tool}</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Collapsible Sections — supporting detail */}
      <Accordion type="multiple" className="space-y-4">
        {/* Evidence + Visuals */}
        {(evidence || visuals) && (
          <AccordionItem value="evidence" className="rounded-2xl border border-border/60 bg-background/90 px-6">
            <AccordionTrigger className="hover:no-underline">
              <CardTitle className="text-base font-semibold">Evidence</CardTitle>
            </AccordionTrigger>
            <AccordionContent className="space-y-6 pb-6">
              {evidence && (
                <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                  <div className="flex items-center justify-between">
                    <span>Quotes</span>
                    <span className="text-foreground">{evidence.quotes_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Invoices</span>
                    <span className="text-foreground">{evidence.invoices_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Paid invoices</span>
                    <span className="text-foreground">{evidence.paid_invoices_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Calendar items</span>
                    <span className="text-foreground">{evidence.calendar_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Window start</span>
                    <span className="text-foreground">{formatDate(evidence.window_start)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Window end</span>
                    <span className="text-foreground">{formatDate(evidence.window_end)}</span>
                  </div>
                </div>
              )}
              {visuals && (
                <EvidenceCharts
                  weeklyVolumeSeries={visuals.weekly_volume_series}
                  invoiceSizeBuckets={visuals.invoice_size_buckets}
                  quoteAgeBuckets={visuals.quote_age_buckets}
                />
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Data Coverage */}
        <AccordionItem value="coverage" className="rounded-2xl border border-border/60 bg-background/90 px-6">
          <AccordionTrigger className="hover:no-underline">
            <CardTitle className="text-base font-semibold">Data coverage</CardTitle>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 pb-6 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Window start</span>
              <span className="text-foreground">{formatDate(artifact.window.start_date)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Window end</span>
              <span className="text-foreground">{formatDate(artifact.window.end_date)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex items-center justify-between">
              <span>Quotes excluded</span>
              <span className="text-foreground">{artifact.window.excluded_counts.quotes_outside_window}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Invoices excluded</span>
              <span className="text-foreground">{artifact.window.excluded_counts.invoices_outside_window}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Calendar excluded</span>
              <span className="text-foreground">{artifact.window.excluded_counts.calendar_outside_window}</span>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Learning - Internal Only */}
        {showInternal && learningNote && (
          <AccordionItem value="learning" className="rounded-2xl border border-border/60 bg-background/90 px-6">
            <AccordionTrigger className="hover:no-underline">
              <CardTitle className="text-base font-semibold">Learning (internal)</CardTitle>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-6 text-sm text-muted-foreground">
              <p>{learningNote.applied ? "Learning adjustments applied." : "Learning models ran with no changes."}</p>
              {learningNote.changes.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {learningNote.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              )}
              {learningNote.model_versions && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Model versions</p>
                  {Object.entries(learningNote.model_versions).map(([key, value]) => (
                    <p key={key}>
                      {key}: {value ?? "n/a"}
                    </p>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Technical Details - Dev Only */}
        {isDev && (
          <AccordionItem value="technical" className="rounded-2xl border border-border/60 bg-background/90 px-6">
            <AccordionTrigger className="hover:no-underline">
              <CardTitle className="text-base font-semibold">Technical details (dev only)</CardTitle>
            </AccordionTrigger>
            <AccordionContent className="pb-6">
              <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/20 p-3 font-mono text-xs text-foreground">
                {JSON.stringify(artifact, null, 2)}
              </pre>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
