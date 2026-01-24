import Link from "next/link";
import { ArrowRight, MessagesSquare, Sparkles } from "lucide-react";

import { ArtifactPreview } from "@/src/components/workspace/ArtifactPreview";
import { InsightCard } from "@/src/components/workspace/InsightCard";
import { PageHeader } from "@/src/components/workspace/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { latestArtifact } from "@/src/lib/demo/demoData";

export default function AppHomePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Decision room overview"
        subtitle="A calm workspace for finite artifacts: one conclusion, a clear boundary, and suggested next steps with messaging in mind."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/app/connections">View connections</Link>
            </Button>
            <Button asChild>
              <Link href="/app/requests">
                Start a request
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ArtifactPreview
            title={latestArtifact.title}
            date={latestArtifact.date}
            decision={latestArtifact.decision}
            boundary={latestArtifact.boundary}
            why={latestArtifact.why}
          />
        </div>
        <div className="space-y-6">
          <Card className="rounded-2xl border border-border/60 bg-background/80">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Suggested next steps
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {latestArtifact.nextSteps.map((step, index) => (
                <div key={step} className="space-y-2">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-foreground">
                      {index + 1}
                    </span>
                    <p>{step}</p>
                  </div>
                  {index < latestArtifact.nextSteps.length - 1 ? (
                    <Separator />
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <InsightCard
            title="Insights"
            bullets={latestArtifact.insights}
            icon={Sparkles}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Request an outside perspective
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Bring a question, boundary, and draft conclusion. We will respond
              with one clear next step.
            </p>
            <Button asChild size="sm">
              <Link href="/app/requests">
                Open request composer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Messaging alignment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Capture the message tied to the conclusion so the team moves in one
              direction.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/analysis">Review the artifact</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground">
              <MessagesSquare className="h-4 w-4" />
            </div>
            <CardTitle className="text-base font-semibold">Connections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Connect scheduling, video, or request-only access to support the
              decision room.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/connections">Browse connections</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
