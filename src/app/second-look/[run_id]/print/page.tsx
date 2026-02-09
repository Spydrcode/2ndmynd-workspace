import Link from "next/link";
import { notFound } from "next/navigation";

import { getRun } from "@/src/lib/intelligence/run_adapter";
import {
  SecondLookArtifactV2Schema,
  type SecondLookArtifactV2,
} from "@/src/lib/second_look_v2/contracts/second_look_artifact_v2";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function asSecondLookArtifact(input: unknown): SecondLookArtifactV2 | null {
  const parsed = SecondLookArtifactV2Schema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export default async function SecondLookPrintPage({
  params,
}: {
  params: Promise<{ run_id: string }>;
}) {
  const { run_id } = await params;
  const run = await getRun(run_id);

  if (!run || !run.results_json || typeof run.results_json !== "object") {
    notFound();
  }

  const results = run.results_json as Record<string, unknown>;
  const artifact = asSecondLookArtifact(results.second_look_artifact_v2);

  if (!artifact) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href="/second-look">Back</Link>
        </Button>
        <p className="text-xs text-muted-foreground">Use browser Print -&gt; Save as PDF.</p>
      </div>

      <Card className="rounded-2xl border border-border/60 bg-background/95">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Second Look V2 - {artifact.meta.business_name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Generated {new Date(artifact.meta.generated_at).toLocaleString()} | Confidence: {artifact.meta.confidence}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <section>
            <p className="text-xs uppercase text-muted-foreground">Conclusion</p>
            <p className="mt-1">{artifact.primary_constraint.statement}</p>
          </section>

          <section>
            <p className="text-xs uppercase text-muted-foreground">Primary Constraint</p>
            <p className="mt-1">{artifact.primary_constraint.why_this}</p>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs uppercase text-muted-foreground">Path A</p>
              <p className="mt-1 font-medium">{artifact.decision_paths.path_A.label}</p>
              <p className="mt-1 text-muted-foreground">{artifact.decision_paths.path_A.thesis}</p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs uppercase text-muted-foreground">Path B</p>
              <p className="mt-1 font-medium">{artifact.decision_paths.path_B.label}</p>
              <p className="mt-1 text-muted-foreground">{artifact.decision_paths.path_B.thesis}</p>
            </div>
          </section>

          <section>
            <p className="text-xs uppercase text-muted-foreground">Neither / Pause</p>
            <p className="mt-1 text-muted-foreground">{artifact.decision_paths.neither.copy}</p>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">7-Day Actions</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {artifact.plan.actions_7_days.map((action) => (
                  <li key={action.install_id}>{action.what}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">30-Day Actions</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {artifact.plan.actions_30_days.map((action) => (
                  <li key={action.install_id}>{action.what}</li>
                ))}
              </ul>
            </div>
          </section>

          <section>
            <p className="text-xs uppercase text-muted-foreground">Boundaries</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {artifact.plan.boundaries.map((boundary) => (
                <li key={boundary}>{boundary}</li>
              ))}
            </ul>
          </section>

          <section>
            <p className="text-xs uppercase text-muted-foreground">Talk Track</p>
            <p className="mt-1 text-muted-foreground">{artifact.talk_track_90s}</p>
          </section>
        </CardContent>
      </Card>

      {artifact.modules.map((module) => (
        <Card key={module.module_id} className="rounded-2xl border border-border/60 bg-background/95">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{module.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{module.narrative}</p>
            {module.bullets?.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {module.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
