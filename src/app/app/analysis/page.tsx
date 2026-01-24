import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/src/components/workspace/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { latestArtifact } from "@/src/lib/demo/demoData";

export default function AnalysisPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Analysis artifact"
        subtitle="A full decision artifact with a boundary and a finite set of next steps."
        actions={
          <Button asChild>
            <Link href="/app/requests">
              Start a request
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Conclusion
          </p>
          <CardTitle className="text-xl font-semibold">
            {latestArtifact.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{latestArtifact.date}</p>
        </CardHeader>
        <CardContent className="space-y-6 text-sm text-muted-foreground">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Decision
            </p>
            <p className="text-foreground">{latestArtifact.decision}</p>
          </div>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Why
            </p>
            <p>{latestArtifact.why}</p>
          </div>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Boundary
            </p>
            <p>{latestArtifact.boundary}</p>
          </div>
          <Separator />
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Suggested next steps
            </p>
            <ul className="space-y-2">
              {latestArtifact.nextSteps.map((step) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-foreground/70" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
