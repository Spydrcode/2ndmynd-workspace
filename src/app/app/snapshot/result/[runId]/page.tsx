import { notFound } from "next/navigation";

import { loadBaseline } from "@/lib/snapshot/baseline";
import type { Artifact, CompanyProfile, HealthComparison } from "@/lib/snapshot/schema";
import { readJSON } from "@/lib/snapshot/storage";

import SnapshotCharts from "./SnapshotCharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(
    date
  );
}

export default async function SnapshotResultPage(props: {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { runId } = await props.params;
  const searchParams = (await props.searchParams) ?? {};
  const print = searchParams.print === "1";

  let artifact: Artifact;
  let company: CompanyProfile;
  let baselineId: string;
  let health: HealthComparison | null = null;

  try {
    artifact = (await readJSON(runId, "artifact.json")) as Artifact;
    company = (await readJSON(runId, "companyProfile.json")) as CompanyProfile;
    const meta = (await readJSON(runId, "meta.json")) as { baseline_id?: string };
    baselineId = artifact.baseline_id ?? meta?.baseline_id ?? artifact.cohort_id;
    try {
      health = (await readJSON(runId, "healthComparison.json")) as HealthComparison;
    } catch {
      health = null;
    }
  } catch {
    notFound();
  }

  const baseline = await loadBaseline(baselineId);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-8">
      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base font-semibold">{artifact.title}</CardTitle>
          <div className="text-xs text-muted-foreground">
            Created {formatDate(artifact.created_at)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            This is a finite snapshot artifact—one page, three visuals, and a short narrative—built from the exports
            you provided.
          </p>
          {!print ? (
            <div className="flex items-center justify-end">
              <Button asChild variant="outline">
                <a href={`/api/snapshot/pdf/${runId}`}>Download PDF</a>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <SnapshotCharts company={company} baseline={baseline} print={print} />

      <div className="space-y-4">
        {artifact.sections.map((section) => {
          if (section.heading === "One clear next step" && health && health.health_notes.length > 0) {
            const stableText = health.health_notes.slice(0, 3).join(" ");
            return (
              <div key="stable-and-next" className="space-y-4">
                <Card className="rounded-2xl border border-border/60 bg-background/90">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Stable Range Check</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{stableText}</CardContent>
                </Card>
                <Card className="rounded-2xl border border-border/60 bg-background/90">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">{section.heading}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{section.body}</CardContent>
                </Card>
              </div>
            );
          }

          return (
            <Card key={section.heading} className="rounded-2xl border border-border/60 bg-background/90">
              <CardHeader>
                <CardTitle className="text-base font-semibold">{section.heading}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{section.body}</CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
