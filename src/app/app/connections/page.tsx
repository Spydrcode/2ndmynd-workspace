import Link from "next/link";

import { PageHeader } from "@/src/components/workspace/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { connectors } from "@/src/lib/demo/demoData";

export default function ConnectionsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Connections"
        subtitle="Connect the decision room to scheduling, meetings, or request-only access."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {connectors.map((connector) => {
          const isComingSoon = connector.status === "Coming soon";
          const isRemote = connector.name === "Remote Access";
          const isZoom = connector.name === "Zoom";
          const isCal = connector.name === "Cal.com";

          return (
            <Card
              key={connector.name}
              className="rounded-2xl border border-border/60 bg-background/90"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold">
                    {connector.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {connector.description}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {connector.status}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {isCal ? (
                  <>
                    <Button size="sm" disabled>
                      Connect (soon)
                    </Button>
                    <Button size="sm" variant="outline" disabled>
                      Configure
                    </Button>
                  </>
                ) : null}
                {isZoom ? (
                  <Button size="sm" asChild>
                    <Link href="/app/zoom">Open portal</Link>
                  </Button>
                ) : null}
                {isRemote ? (
                  <Button size="sm" asChild>
                    <Link href="/app/remote">Request session</Link>
                  </Button>
                ) : null}
                {isComingSoon ? (
                  <Button size="sm" variant="outline" disabled>
                    Coming soon
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
