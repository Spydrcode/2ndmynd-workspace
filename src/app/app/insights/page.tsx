import { CheckCircle2 } from "lucide-react";

import { PageHeader } from "@/src/components/workspace/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  insightPointsTo,
  insightSignals,
  latestArtifact,
} from "@/src/lib/demo/demoData";

export default function InsightsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Insights"
        subtitle="Short signals and what they point to, grounded in the latest conclusion."
      />

      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Latest signals and interpretation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signals" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="signals">Signals</TabsTrigger>
              <TabsTrigger value="points">What it points to</TabsTrigger>
              <TabsTrigger value="next">Next step</TabsTrigger>
            </TabsList>
            <TabsContent value="signals" className="space-y-3">
              <ul className="space-y-3 text-sm text-muted-foreground">
                {insightSignals.map((signal) => (
                  <li key={signal} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-foreground" />
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="points" className="space-y-3">
              <ul className="space-y-3 text-sm text-muted-foreground">
                {insightPointsTo.map((point) => (
                  <li key={point} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-foreground" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="next" className="space-y-3">
              <ul className="space-y-3 text-sm text-muted-foreground">
                {latestArtifact.nextSteps.map((step) => (
                  <li key={step} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-foreground" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
