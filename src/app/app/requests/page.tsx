import { Send } from "lucide-react";

import { PageHeader } from "@/src/components/workspace/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requests } from "@/src/lib/demo/demoData";

export default function RequestsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Requests"
        subtitle="Send a focused prompt with a boundary and the conclusion you are leaning toward."
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Compose a request
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Title (optional)
              </label>
              <Input placeholder="Decision room question" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Request
              </label>
              <Textarea
                placeholder="Share the context, boundary, and any conclusion you want stress-tested."
                className="min-h-[140px]"
              />
            </div>
            <Button className="w-full sm:w-auto">
              Send request
              <Send className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Recent requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {requests.length === 0 ? (
              <p>There are no requests yet. Start with one clear question.</p>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => (
                  <div
                    key={request.title}
                    className="space-y-2 rounded-xl border border-border/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {request.title}
                      </p>
                      <Badge variant="secondary">{request.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {request.date}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
