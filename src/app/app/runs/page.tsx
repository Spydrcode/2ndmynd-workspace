import Link from "next/link";

import { listRuns } from "@/src/lib/intelligence/run_adapter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function formatTimestamp(value?: string | null) {
  if (!value) return "Timestamp unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function RunsPage() {
  const runs = await listRuns();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Snapshots</h1>
          <p className="text-sm text-muted-foreground">
            Each run is a single decision snapshot. No monitoring, just clarity.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/app/connect">New snapshot</Link>
        </Button>
      </div>

      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {runs.length === 0 ? (
            <p>No runs yet. Upload exports to generate a snapshot.</p>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => {
                const conclusion = run.results_json?.conclusion ?? null;
                const validation = run.validation_json ?? run.results_json?.validation ?? null;
                return (
                  <div
                    key={run.run_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3"
                  >
                    <div className="min-w-[220px] space-y-1">
                      <p className="font-mono text-xs text-muted-foreground">{run.run_id}</p>
                      <p className="text-foreground">{formatTimestamp(run.created_at)}</p>
                      {run.website_url ? (
                        <p className="text-xs text-muted-foreground">{run.website_url}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {run.status ? <Badge variant="secondary">{run.status}</Badge> : null}
                      {validation ? (
                        <Badge variant={validation.ok ? "outline" : "destructive"}>
                          {validation.ok ? "Validated" : "Needs review"}
                        </Badge>
                      ) : null}
                      {conclusion?.confidence ? (
                        <Badge variant="outline">
                          {conclusion.confidence} confidence
                        </Badge>
                      ) : null}
                    </div>

                    <Separator orientation="vertical" className="hidden h-10 lg:block" />

                    <Button asChild size="sm">
                      <Link href={`/app/results/${run.run_id}`}>View</Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
