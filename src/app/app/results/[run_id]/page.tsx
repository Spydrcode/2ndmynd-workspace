import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";

import { presentArtifact } from "@/lib/decision/v2/present";
import { buildResultsArtifact, getRun, InputHealth } from "@/src/lib/intelligence/run_adapter";
import type { LayerFusionResult } from "@/src/lib/intelligence/layer_fusion/types";
import type { BenchmarkResult } from "@/src/lib/benchmarks/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { rerunSnapshot } from "./actions";
import { DecisionArtifactView } from "./DecisionArtifactView";
import type { DecisionArtifactV1 } from "@/src/lib/types/decision_artifact";
import type { PresentedCoherenceArtifact } from "@/src/lib/present/present_coherence";
import { presentCoherenceSnapshot } from "@/src/lib/present/present_coherence";
import type { CoherenceSnapshot, CoherenceDrift } from "@/src/lib/types/coherence_engine";
import { CoherencePanelClient } from "./CoherencePanelClient";

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

function renderInputHealth(inputHealth?: InputHealth | null) {
  if (!inputHealth) {
    return <p className="text-sm text-muted-foreground">Input health unavailable.</p>;
  }
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <div className="flex items-center justify-between">
        <span>Date range</span>
        <span className="text-foreground">{inputHealth.date_range ?? "Unknown"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span>Records</span>
        <span className="text-foreground">{inputHealth.records_count ?? "Unknown"}</span>
      </div>
      {inputHealth.coverage_warnings?.length ? (
        <ul className="list-disc pl-5">
          {inputHealth.coverage_warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p>Coverage looks complete.</p>
      )}
    </div>
  );
}

type FileAttempt = {
  filename: string;
  type_guess: string;
  status: "success" | "error" | "unknown";
  error?: string;
};

function getFileAttempts(inputRecognition: unknown): FileAttempt[] {
  if (!inputRecognition || typeof inputRecognition !== "object") return [];
  const record = inputRecognition as Record<string, unknown>;
  const raw = record.files_attempted;
  if (!Array.isArray(raw)) return [];
  const out: FileAttempt[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const filename = typeof e.filename === "string" ? e.filename : "unknown";
    const type_guess = typeof e.type_guess === "string" ? e.type_guess : "unknown";
    const statusRaw = typeof e.status === "string" ? e.status : "unknown";
    const status: FileAttempt["status"] = statusRaw === "success" || statusRaw === "error" ? statusRaw : "unknown";
    const error = typeof e.error === "string" ? e.error : undefined;
    out.push({ filename, type_guess, status, error });
  }
  return out;
}

function SnapshotSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Snapshot in progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">One clear takeaway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">What to do next</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
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
  const quiet = String(sp?.quiet ?? "") === "1";
  const internal = String(sp?.internal ?? "") === "1";
  const internalAllowed =
    internal &&
    (process.env.NODE_ENV !== "production" || process.env.ALLOW_INTERNAL_TESTING === "true");

  const run = await getRun(run_id);
  if (!run) {
    notFound();
  }

  const artifact = buildResultsArtifact(run);
  const readinessForPresent =
    artifact.readiness_level === "ready"
      ? "ready"
      : artifact.readiness_level
        ? "diagnose"
        : null;

  const presented = presentArtifact({
    run_id: artifact.run_id,
    created_at: artifact.created_at,
    mode: run.mode ?? null,
    artifact: {
      conclusion: artifact.conclusion,
      snapshot: artifact.snapshot,
      input_health: artifact.input_health,
      data_warnings: artifact.data_warnings,
      readiness_level: readinessForPresent,
      layer_fusion: artifact.layer_fusion as LayerFusionResult | null,
      benchmarks: artifact.benchmarks as BenchmarkResult | null,
      mapping_confidence: artifact.mapping_confidence,
      business_profile: artifact.business_profile,
    },
  });

  const conclusion = artifact.conclusion;
  const validation = artifact.validation;
  const profile = artifact.business_profile;
  const fileAttempts = getFileAttempts(artifact.input_recognition);
  const predictiveWatchList = artifact.predictive_watch_list ?? null;
  const watchItems = predictiveWatchList?.items ?? [];
  const archetypes = artifact.archetypes ?? null;
  
  // Type-safe decision_artifact extraction — prefer stored, fall back to rebuilt
  const storedArtifact = artifact.decision_artifact as DecisionArtifactV1 | null | undefined;
  const decision_artifact = 
    storedArtifact?.version === "v1" 
      ? storedArtifact 
      : presented.built_decision_artifact ?? null;
  const hasDecisionArtifact = decision_artifact?.version === "v1";

  // Coherence snapshot — new coherence engine output
  const storedPresented = artifact.presented_coherence_v1 as PresentedCoherenceArtifact | null | undefined;
  const rawSnapshot = artifact.coherence_snapshot as CoherenceSnapshot | null | undefined;
  const rawDrift = artifact.coherence_drift as CoherenceDrift | null | undefined;
  const driftFromSnapshot = rawSnapshot?.review?.drift as CoherenceDrift | undefined;
  const coherenceRaw =
    storedPresented?.version === "presented_coherence_v1"
      ? storedPresented
      : rawSnapshot?.version === "coherence_v1"
        ? presentCoherenceSnapshot(rawSnapshot, rawDrift ?? driftFromSnapshot)
        : null;
  const hasCoherence = coherenceRaw?.version === "presented_coherence_v1";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{presented.header.title}</h1>
            <Badge variant="outline">{titleCase(presented.header.confidence)} confidence</Badge>
            <Badge variant="secondary">{titleCase(presented.header.source)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Run {run.run_id} · {formatTimestamp(run.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/results/${run.run_id}/download`}>
              <Download className="mr-2 h-4 w-4" />
              Download snapshot
            </Link>
          </Button>

          {run.pack_id ? (
            <form
              action={rerunSnapshot}
              className="inline-flex"
              aria-label="Rerun snapshot"
            >
              <input type="hidden" name="pack_id" value={run.pack_id} />
              <input type="hidden" name="source_run_id" value={run.run_id} />
              <Button type="submit" variant="default">
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-run
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {presented.data_warnings.length ? (
        <Alert>
          <AlertTitle>Data note</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {presented.data_warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {profile?.summary ? (
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Business context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{profile.summary}</p>
            {profile.services?.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.services.map((service) => (
                  <Badge key={service} variant="outline">
                    {service}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!conclusion && !artifact.diagnose_mode ? (
        <SnapshotSkeleton />
      ) : hasCoherence ? (
        <CoherencePanelClient
          run_id={run.run_id}
          artifact={coherenceRaw!}
          isDev={!quiet}
        />
      ) : hasDecisionArtifact ? (
        <DecisionArtifactView
          artifact={decision_artifact!}
          isDev={!quiet}
          showInternal={internalAllowed}
          archetypes={archetypes}
          watchList={watchItems}
        />) : (
        <div className="space-y-6">
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">One clear takeaway</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-foreground">{presented.takeaway}</CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">What to do next (7 days)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="text-foreground">{presented.next_action}</p>
              {presented.micro_steps.length ? (
                <ul className="list-disc space-y-1 pl-5">
                  {presented.micro_steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              ) : null}
              {conclusion && typeof conclusion.boundary === "string" && conclusion.boundary.trim().length ? (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground">Boundary: {conclusion.boundary}</p>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Why it likely feels heavy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{presented.why_heavy}</CardContent>
          </Card>

          {!quiet && watchItems.length > 0 ? (
            <Card className="rounded-2xl border border-border/60 bg-background/90">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  What might shift in the next 30–90 days (optional)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <details>
                  <summary className="cursor-pointer select-none text-sm text-foreground">
                    Show watch list
                  </summary>
                  <div className="mt-3 space-y-4">
                    {watchItems.map((item) => (
                      <div key={item.topic} className="space-y-1">
                        <p className="font-medium text-foreground">{item.topic}</p>
                        <p className="text-xs text-muted-foreground">{item.why}</p>
                        <p className="text-xs italic text-muted-foreground">
                          What to watch: {item.what_to_watch}
                        </p>
                      </div>
                    ))}
                    <Separator />
                    <p className="text-xs text-muted-foreground italic">
                      This is a watch list, not a forecast.
                    </p>
                  </div>
                </details>
              </CardContent>
            </Card>
          ) : null}

          {!quiet ? (
            <Card className="rounded-2xl border border-border/60 bg-background/90">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Evidence (optional)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <details>
                  <summary className="cursor-pointer select-none text-sm text-foreground">
                    Show evidence
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {presented.evidence_chips.length ? (
                      presented.evidence_chips.map((chip) => (
                        <details key={`${chip.label}:${chip.value}`} className="group">
                          <summary className="cursor-pointer list-none">
                            <Badge variant="outline">
                              {chip.label}: {chip.value}
                            </Badge>
                          </summary>
                          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                            {chip.explanation}
                          </p>
                        </details>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Evidence is not available for this run.</p>
                    )}
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer select-none text-xs text-muted-foreground">
                      Show technical details
                    </summary>
                    <div className="mt-2 space-y-2">
                      {presented.technical_details?.signals.map((s) => (
                        <pre
                          key={`${s.key}=${s.value}`}
                          className="overflow-x-auto rounded-lg border border-border/60 bg-muted/20 p-3 font-mono text-xs text-foreground"
                        >
                          {s.key}={s.value}
                        </pre>
                      ))}
                    </div>
                  </details>
                </details>
              </CardContent>
            </Card>
          ) : null}

          {!quiet ? (
            <Card className="rounded-2xl border border-border/60 bg-background/90">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Data health (optional)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <details>
                  <summary className="cursor-pointer select-none text-sm text-foreground">
                    Show data health
                  </summary>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Quotes detected</span>
                      <span className="text-foreground">{presented.data_health.quotes_count ?? "?"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Invoices detected</span>
                      <span className="text-foreground">{presented.data_health.invoices_count ?? "?"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Date range</span>
                      <span className="text-foreground">{presented.data_health.date_range ?? "Unknown"}</span>
                    </div>
                    <Separator />
                    <p>{presented.data_health.coverage_text}</p>
                    <Separator />
                    {renderInputHealth(artifact.input_health)}
                    {artifact.input_recognition ? (
                      <>
                        <Separator />
                        <p className="text-xs text-muted-foreground">
                          Recognition: {artifact.input_recognition.quotes_detected_count ?? "?"} quotes,{" "}
                          {artifact.input_recognition.invoices_detected_count ?? "?"} invoices,{" "}
                          {artifact.input_recognition.invoices_paid_detected_count ?? "?"} paid invoices detected.
                        </p>
                        {fileAttempts.length ? (
                          <div className="pt-2 text-xs text-muted-foreground">
                            <p className="mb-1">Files attempted:</p>
                            <ul className="list-disc space-y-1 pl-5">
                              {fileAttempts.map((entry) => {
                                const error = entry.error ? `: ${entry.error}` : "";
                                return (
                                  <li key={`${entry.filename}:${entry.type_guess}:${entry.status}`}>
                                    {entry.filename} — {entry.type_guess} ({entry.status}
                                    {error})
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </details>
              </CardContent>
            </Card>
          ) : null}

          {validation && !validation.ok ? (
            <Alert variant="destructive">
              <AlertTitle>Validation issues</AlertTitle>
              <AlertDescription>
                {validation.errors?.join("; ") ?? "Validation failed."}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}
    </div>
  );
}
