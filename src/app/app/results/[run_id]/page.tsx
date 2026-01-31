import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";

import {
  buildResultsArtifact,
  getRun,
  listRuns,
  InputHealth,
  Run,
} from "@/src/lib/intelligence/run_adapter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        <span className="text-foreground">
          {inputHealth.records_count ?? "Unknown"}
        </span>
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
            <CardTitle className="text-base font-semibold">Outside perspective</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Inputs</CardTitle>
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

export default async function ResultsPage({ params }: { params: { run_id: string } }) {
  const run = await getRun(params.run_id);
  if (!run) {
    notFound();
  }

  const history = await listRuns();
  const conclusion = run.results_json?.conclusion ?? null;
  const validation = run.validation_json ?? run.results_json?.validation ?? null;
  const profile = run.business_profile_json ?? null;
  const confidence = titleCase(conclusion?.confidence ?? "unknown");
  const artifact = buildResultsArtifact(run);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {profile?.name_guess ?? "Business snapshot"}
            </h1>
            <Badge variant="outline">Snapshot</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatTimestamp(run.created_at)}</span>
            <Separator orientation="vertical" className="h-3" />
            <span className="font-mono">{run.run_id}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{confidence} confidence</Badge>
          {run.mode ? <Badge variant="outline">{run.mode}</Badge> : null}
        </div>
      </div>

      {run.status && run.status !== "succeeded" ? (
        <Alert variant={run.status === "failed" ? "destructive" : "default"}>
          <AlertTitle>
            {run.status === "failed" ? "Snapshot failed" : "Snapshot running"}
          </AlertTitle>
          <AlertDescription>
            {run.status === "failed"
              ? run.error ?? "We hit an error while preparing this snapshot."
              : "We are still assembling your outside perspective. Refresh in a moment."}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Business profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{profile?.summary ?? "Profile unavailable."}</p>
          {profile?.services?.length ? (
            <div className="flex flex-wrap gap-2">
              {profile.services.map((service) => (
                <Badge key={service} variant="secondary">
                  {service}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="snapshot" className="space-y-6">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
          <TabsTrigger value="signals">Signals</TabsTrigger>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="snapshot" className="space-y-6">
          {!conclusion ? (
            <SnapshotSkeleton />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <Card className="rounded-2xl border border-border/60 bg-background/90">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Outside perspective</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-muted-foreground">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        What's going on
                      </p>
                      <p className="mt-2 text-foreground">
                        {conclusion.one_sentence_pattern ?? "No pattern available."}
                      </p>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        What to do next
                      </p>
                      <p className="mt-2 text-foreground">
                        {conclusion.decision ?? "Decision pending."}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="rounded-2xl border border-border/60 bg-background/90">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">Why this now</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {conclusion.why_this_now ?? "Waiting on supporting context."}
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border border-border/60 bg-background/90">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">Boundary</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {conclusion.boundary ?? "No boundary set yet."}
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-2xl border border-border/60 bg-background/90">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Evidence signals</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {(conclusion.evidence_signals ?? []).length ? (
                      conclusion.evidence_signals?.map((signal) => (
                        <Badge key={signal} variant="outline">
                          {signal}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Signals pending.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border/60 bg-background/90">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Data health</CardTitle>
                  </CardHeader>
                  <CardContent>{renderInputHealth(run.input_health_json)}</CardContent>
                </Card>

                {validation && !validation.ok ? (
                  <Alert variant="destructive">
                    <AlertTitle>Validation issues</AlertTitle>
                    <AlertDescription>
                      {validation.errors?.join("; ") ?? "Validation failed."}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <div className="space-y-6">
                <Card className="rounded-2xl border border-border/60 bg-background/90">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Next steps</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {conclusion.optional_next_steps?.length ? (
                      <ul className="space-y-2">
                        {conclusion.optional_next_steps.map((step) => (
                          <li key={step} className="flex items-start gap-2">
                            <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-primary" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No optional steps were suggested.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border/60 bg-background/90">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Decision artifact</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>Download the single snapshot artifact for sharing.</p>
                    <Button asChild className="w-full">
                      <Link href={`/app/results/${artifact.run_id}/download`}>
                        <Download className="mr-2 h-4 w-4" />
                        Download artifact
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <form action={rerunSnapshot}>
                  <input type="hidden" name="pack_id" value={run.pack_id ?? ""} />
                  <Button type="submit" variant="secondary" className="w-full">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Re-run snapshot
                  </Button>
                </form>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="signals">
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Signals behind the decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {(conclusion?.evidence_signals ?? []).length ? (
                <div className="flex flex-wrap gap-2">
                  {conclusion?.evidence_signals?.map((signal) => (
                    <Badge key={signal} variant="secondary">
                      {signal}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p>No signals are available yet.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Signals summarize the most relevant inputs that informed this snapshot.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inputs" className="space-y-6">
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Inputs used</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {run.input_sources?.length ? (
                <div className="flex flex-wrap gap-2">
                  {run.input_sources.map((source) => (
                    <Badge key={source.label} variant="outline">
                      {source.label} {source.count ?? 0}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p>Sources not yet detected.</p>
              )}
              {renderInputHealth(run.input_health_json)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Recent snapshots</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {history.length === 0 ? (
                <p>No snapshots yet.</p>
              ) : (
                <div className="space-y-3">
                  {history.slice(0, 6).map((item: Run) => (
                    <div
                      key={item.run_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3"
                    >
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{item.run_id}</p>
                        <p className="text-foreground">
                          {formatTimestamp(item.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.status ? (
                          <Badge variant="secondary">{item.status}</Badge>
                        ) : null}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/app/results/${item.run_id}`}>View</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
