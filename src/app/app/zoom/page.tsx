import Link from "next/link";
import { Video } from "lucide-react";

import { PageHeader } from "@/src/components/workspace/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ZoomPortalPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Zoom portal"
        subtitle="Meeting placeholders for decision rooms. Launches will be enabled once Zoom is connected."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/connections">Configure Cal.com</Link>
          </Button>
        }
      />

      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Meetings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="rounded-xl border border-dashed border-border/70 p-4">
            <p className="font-medium text-foreground">No meetings yet</p>
            <p className="text-xs text-muted-foreground">
              Your decision room meetings will appear here.
            </p>
          </div>
          <Button disabled className="w-full sm:w-auto">
            <Video className="mr-2 h-4 w-4" />
            Start Zoom session
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
