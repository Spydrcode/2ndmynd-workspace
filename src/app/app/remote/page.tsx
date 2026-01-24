import { Shield } from "lucide-react";

import { PageHeader } from "@/src/components/workspace/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function RemoteAccessPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Remote access"
        subtitle="Request-only access for time-bound support sessions."
      />

      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground">
            <Shield className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-semibold">
            Request a session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Reason for access
            </label>
            <Textarea
              placeholder="Describe what needs to be reviewed and the boundary of the request."
              className="min-h-[120px]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Preferred time
            </label>
            <Input placeholder="Add a window that works for you" />
          </div>
          <div className="rounded-xl border border-dashed border-border/70 p-4 text-xs">
            <p className="font-medium text-foreground">
              Remote access is request-only and time-bound.
            </p>
            <p className="mt-2">
              You control approval and can end the session anytime. (No actual
              remote tooling is implemented; this is a UI placeholder.)
            </p>
          </div>
          <Button disabled className="w-full sm:w-auto">
            Send request
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
