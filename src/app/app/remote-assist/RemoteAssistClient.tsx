"use client";

import { useFormState } from "react-dom";
import { Calendar, Video } from "lucide-react";

import { createRemoteAssistRequest } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

const CAL_LINK = "https://cal.com/2ndmynd/remote-assist";

type RemoteAssistClientProps = {
  defaultWebsite?: string;
};

export default function RemoteAssistClient({ defaultWebsite }: RemoteAssistClientProps) {
  const [formState, formAction] = useFormState(createRemoteAssistRequest, {});
  const websiteValue = typeof defaultWebsite === "string" ? defaultWebsite : "";

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Remote Assist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Schedule a session and we will guide the export with you. No
            remote-control tools are used in-app.
          </p>
          <Button asChild variant="outline">
            <a href={CAL_LINK} target="_blank" rel="noreferrer">
              <Calendar className="mr-2 h-4 w-4" />
              Schedule with Cal.com
            </a>
          </Button>
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-xs">
            Prepare: recent quotes/estimates export, invoices export, and job list
            (if available).
          </div>
        </CardContent>
      </Card>

      <form action={formAction} className="space-y-4">
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Request details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <Input name="tool" placeholder="Tool used (e.g., Jobber, QuickBooks)" />
            <Input
              name="cal_link"
              placeholder="Scheduling link (optional)"
              defaultValue={CAL_LINK}
            />
            <Input
              name="website_url"
              placeholder="Business website (optional)"
              defaultValue={websiteValue}
            />
            <Textarea
              name="notes"
              rows={4}
              placeholder="Preferred times, any export details, or context."
            />
            <Button type="submit">
              <Video className="mr-2 h-4 w-4" />
              Request Remote Assist
            </Button>
          </CardContent>
        </Card>
      </form>

      {formState?.ok ? (
        <Alert>
          <AlertDescription>
            Request received. We will confirm your session and export checklist.
          </AlertDescription>
        </Alert>
      ) : null}

      {formState?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{formState.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
