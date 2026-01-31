"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, UploadCloud, Video } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ConnectPage() {
  const [website, setWebsite] = useState("");

  const uploadHref = website
    ? `/app/upload?website=${encodeURIComponent(website)}`
    : "/app/upload";

  const remoteHref = website
    ? `/app/remote-assist?website=${encodeURIComponent(website)}`
    : "/app/remote-assist";

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Connect & Upload
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Pick a path. You can upload exports yourself or request Remote Assist.</p>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Business website (optional)
            </label>
            <Input
              placeholder="https://yourbusiness.com"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Upload exports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Upload the export files you already have. No connectors required.</p>
            <Button asChild>
              <Link href={uploadHref}>
                <UploadCloud className="mr-2 h-4 w-4" />
                Start upload
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Remote Assist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Schedule a session. We guide the export with you.</p>
            <Button asChild variant="outline">
              <Link href={remoteHref}>
                <Video className="mr-2 h-4 w-4" />
                Request Remote Assist
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
