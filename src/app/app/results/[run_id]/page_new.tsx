import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, RefreshCw, ChevronDown } from "lucide-react";

import { presentArtifact } from "@/lib/decision/v2/present";
import { buildResultsArtifact, getRun, InputHealth } from "@/src/lib/intelligence/run_adapter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { rerunSnapshot } from "./actions";

function formatTimestamp(value?: string | null) {
  if (!value) return "Timestamp unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function titleCase(value?: string | null) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ run_id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { run_id } = await params;
  const sp = searchParams ? await searchParams : {};
  const internal = String(sp?.internal ?? "") === "1";
  const isDev = process.env.NODE_ENV === "development";
  const showInternal = internal || isDev;

  const run = await getRun(run_id);
  if (!run) {
    notFound();
  }

  const artifact = buildResultsArtifact(run);
  const presented = presentArtifact({
    run_id: artifact.run_id,
    created_at: artifact.created_at,
    mode: run.mode ?? null,
    artifact,
  });

  const conclusion = artifact.conclusion;
  const validation = artifact.validation;
  const profile = artifact.business_profile;
  const isLive = presented.header.source === "live";
  const sourceLabel = isLive ? "Live data" : isDev ? "Sample data" : "";

  // Build data coverage message
  const snapshot = artifact.snapshot as { window?: { window_type?: string; lookback_days?: number }; exclusions?: { quotes_outside_window_count?: number; invoices_outside_window_count?: number } } | null;
  const windowType = snapshot?.window?.window_type ?? "last_90_days";
  const lookbackDays = snapshot?.window?.lookback_days ?? 90;
  const quotesExcluded = snapshot?.exclusions?.quotes_outside_window_count ?? 0;
  const invoicesExcluded = snapshot?.exclusions?.invoices_outside_window_count ?? 0;

  let windowDescription = `Based on last ${lookbackDays} days`;
  if (windowType === "cap_100_closed") {
    windowDescription = "Based on last 100 closed estimates";
  }

  // Low confidence banner
  const showConfidenceBanner = presented.header.confidence === "low" || presented.header.confidence === "medium";
  const mappingConfidence = artifact.mapping_confidence ?? "high";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{presented.header.title}</h1>
            {sourceLabel && (
              <Badge variant="secondary" className="text-xs">
                {sourceLabel}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {windowDescription}
            {presented.header.window_summary && (
              <span className="ml-1">· {presented.header.window_summary.replace(/Last \d+ days \(/, "").replace(/\)$/, "")}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/results/${run.run_id}/download`}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Link>
          </Button>

          {run.pack_id ? (
            <form
              action={rerunSnapshot}
              className="inline-flex"
              aria-label="Rerun snapshot"
            >
              <input type="hidden" name="pack_id" value={run.pack_id} />
              <Button type="submit" variant="default" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-run
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {/* Confidence banner (only when medium/low) */}
      {showConfidenceBanner && mappingConfidence !== "high" && (
        <Alert>
          <AlertTitle>Data mapping note</AlertTitle>
          <AlertDescription>
            We may be missing or mis-mapping a field. Review data coverage below before acting.
          </AlertDescription>
        </Alert>
      )}

      {/* Data warnings (blocking issues) */}
      {presented.data_warnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Data note</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {presented.data_warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {!conclusion && !artifact.diagnose_mode ? (
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Snapshot in progress</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Your snapshot is assembling...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* PRIMARY: One clear takeaway */}
          <Card className="rounded-2xl border-2 border-primary/20 bg-background/95 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">One clear takeaway</CardTitle>
            </CardHeader>
            <CardContent className="text-base leading-relaxed text-foreground">
              {presented.takeaway}
            </CardContent>
          </Card>

          {/* SECONDARY: Why it feels heavy */}
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardContent className="pt-6">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {presented.why_heavy}
              </p>
            </CardContent>
          </Card>

          {/* ACTION: What to do next (7 days) */}
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">What to do next (7 days)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="text-foreground">{presented.next_action}</p>
              {presented.micro_steps.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {presented.micro_steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* BOUNDARY: When not to act */}
          {presented.boundary && (
            <div className="flex items-center justify-center">
              <Badge variant="outline" className="px-4 py-2 text-xs">
                Boundary: {presented.boundary}
              </Badge>
            </div>
          )}

          {/* PROGRESSIVE DISCLOSURE: Collapsible sections */}
          <Accordion type="multiple" className="space-y-4">
            {/* Pressure map (how we got here) */}
            {presented.pressure_map && presented.pressure_map.length > 0 && (
              <AccordionItem value="pressure-map" className="rounded-2xl border border-border/60 bg-background/90 px-6">
                <AccordionTrigger className="text-base font-semibold hover:no-underline">
                  Pressure map (how we got here)
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-6 text-sm text-muted-foreground">
                  {presented.pressure_map.map((pressure, idx) => (
                    <div key={pressure.key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{idx + 1}. {titleCase(pressure.label)}</span>
                        {pressure.percentile !== undefined && (
                          <Badge variant="outline" className="text-xs">
                            {pressure.percentile}th percentile
                          </Badge>
                        )}
                      </div>
                      <p>{pressure.sentence}</p>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* You vs peers (benchmarks) */}
            {presented.benchmarks && presented.benchmarks.top_signals.length > 0 && (
              <AccordionItem value="benchmarks" className="rounded-2xl border border-border/60 bg-background/90 px-6">
                <AccordionTrigger className="text-base font-semibold hover:no-underline">
                  You vs peers ({presented.benchmarks.cohort_label})
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-6 text-sm text-muted-foreground">
                  {presented.benchmarks.top_signals.map((signal) => (
                    <div key={signal.metric_label} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{titleCase(signal.metric_label)}</span>
                        <Badge variant="outline" className="text-xs">
                          {signal.value_display}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {signal.percentile}th percentile
                        </Badge>
                      </div>
                      <p className="text-xs">{signal.interpretation}</p>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Data coverage (what was used) */}
            <AccordionItem value="data-coverage" className="rounded-2xl border border-border/60 bg-background/90 px-6">
              <AccordionTrigger className="text-base font-semibold hover:no-underline">
                Data coverage (what was used)
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-6 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Quotes detected</span>
                  <span className="text-foreground">{presented.data_health.quotes_count ?? "?"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Invoices detected</span>
                  <span className="text-foreground">{presented.data_health.invoices_count ?? "?"}</span>
                </div>
                {presented.data_health.calendar_count !== null && (
                  <div className="flex items-center justify-between">
                    <span>Calendar events</span>
                    <span className="text-foreground">{presented.data_health.calendar_count}</span>
                  </div>
                )}
                <Separator />
                <div className="text-xs">
                  <p className="mb-1 font-medium text-foreground">Window used:</p>
                  <p>{windowDescription}</p>
                  {(quotesExcluded > 0 || invoicesExcluded > 0) && (
                    <p className="mt-2">
                      Excluded: {quotesExcluded > 0 && `${quotesExcluded} quote(s)`}
                      {quotesExcluded > 0 && invoicesExcluded > 0 && ", "}
                      {invoicesExcluded > 0 && `${invoicesExcluded} invoice(s)`} outside window.
                    </p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Technical details (internal only) */}
            {showInternal && presented.technical_details && (
              <AccordionItem value="technical" className="rounded-2xl border border-border/60 bg-muted/30 px-6">
                <AccordionTrigger className="text-base font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    Technical details
                    <Badge variant="secondary" className="text-xs">
                      Internal
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-6 text-xs text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground">Run manifest:</p>
                    <p>{presented.technical_details.manifest_summary}</p>
                  </div>
                  {presented.technical_details.archetype_hints && (
                    <div>
                      <p className="font-medium text-foreground">Archetypes:</p>
                      <p>{presented.technical_details.archetype_hints}</p>
                    </div>
                  )}
                  <Separator />
                  <div>
                    <p className="mb-2 font-medium text-foreground">Evidence signals:</p>
                    {presented.evidence_chips.map((chip) => (
                      <div key={`${chip.label}:${chip.value}`} className="mb-2 rounded-lg border border-border/40 bg-background/50 p-2">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {chip.label}: {chip.value}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{chip.explanation}</p>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>

          {/* Business context (optional, minimal) */}
          {profile?.summary && (
            <Card className="rounded-2xl border border-border/40 bg-muted/20">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">{profile.summary}</p>
                {profile.services?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {profile.services.slice(0, 3).map((service) => (
                      <Badge key={service} variant="outline" className="text-xs">
                        {service}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Validation issues */}
          {validation && !validation.ok && (
            <Alert variant="destructive">
              <AlertTitle>Validation issues</AlertTitle>
              <AlertDescription>
                {validation.errors?.join("; ") ?? "Validation failed."}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
