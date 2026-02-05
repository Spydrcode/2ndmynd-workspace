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

type DecisionArtifactViewProps = {
  artifact: DecisionArtifactV1;
  isDev?: boolean;
  showInternal?: boolean;
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

export function DecisionArtifactView({
  artifact,
  isDev = false,
  showInternal = false,
}: DecisionArtifactViewProps) {
  const evidence = artifact.evidence_summary;
  const visuals = artifact.visuals_summary;
  const opportunities = artifact.website_opportunities ?? [];
  const learningNote = artifact.learning_note;
  const benchmarks = artifact.benchmarks;

  return (
    <div className="space-y-6">
      {/* Header: Window + Confidence */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <WindowSummary window={artifact.window} />
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

        {/* Why Heavy - Short */}
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Why it likely feels heavy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{artifact.why_heavy}</p>
          </CardContent>
        </Card>

        {/* Next 7 Days - Bullets */}
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">What to do next (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {artifact.next_7_days.map((step, idx) => (
                <li key={idx} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Boundary Chip Row */}
        {artifact.boundary && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Boundary:</span>
            <Badge variant="outline" className="text-sm">
              {artifact.boundary}
            </Badge>
          </div>
        )}
      </div>

      {/* Collapsible Sections */}
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

        {/* Pressure Map */}
        {artifact.pressure_map.length > 0 && (
          <AccordionItem value="pressure" className="rounded-2xl border border-border/60 bg-background/90 px-6">
            <AccordionTrigger className="hover:no-underline">
              <CardTitle className="text-base font-semibold">Pressure points ({artifact.pressure_map.length})</CardTitle>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
              {artifact.pressure_map.map((signal, idx) => (
                <div key={signal.key} className="space-y-1 border-l-2 border-primary/30 pl-4">
                  <p className="text-sm font-medium text-foreground">{signal.label}</p>
                  <p className="text-sm text-muted-foreground">{signal.sentence}</p>
                  {signal.percentile !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      You: {signal.percentile}th percentile vs peers
                    </p>
                  )}
                  <p className="text-xs italic text-muted-foreground">
                    Recommended: {signal.recommended_move}
                  </p>
                  <p className="text-xs text-muted-foreground">Boundary: {signal.boundary}</p>
                  {idx < artifact.pressure_map.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Website Opportunities */}
        {opportunities.length > 0 && (
          <AccordionItem value="website" className="rounded-2xl border border-border/60 bg-background/90 px-6">
            <AccordionTrigger className="hover:no-underline">
              <CardTitle className="text-base font-semibold">Website opportunities</CardTitle>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
              {opportunities.map((item, idx) => (
                <div key={`${item.title}-${idx}`} className="space-y-1 border-l-2 border-primary/30 pl-4">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.why}</p>
                  {item.suggested_tool && (
                    <p className="text-xs text-muted-foreground">Suggested tool: {item.suggested_tool}</p>
                  )}
                  {idx < opportunities.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Benchmarks - "You vs peers" */}
        {benchmarks && (
          <AccordionItem value="benchmarks" className="rounded-2xl border border-border/60 bg-background/90 px-6">
            <AccordionTrigger className="hover:no-underline">
              <CardTitle className="text-base font-semibold">
                You vs peers ({benchmarks.cohort_label})
              </CardTitle>
            </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-6">
            <p className="text-xs text-muted-foreground">
              Cohort: {benchmarks.cohort_label} ({benchmarks.version})
            </p>
            <div className="space-y-3">
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

                  return (
                    <div key={metric.key} className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{insight.headline}</p>
                      <p className="text-xs text-muted-foreground">{insight.so_what}</p>
                      <div className="text-xs text-muted-foreground">
                        You: {formatMetricValue(metric)} | Peer median: {formatPeerMedian(metric)} | {metric.percentile}
                        th percentile
                      </div>
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

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
