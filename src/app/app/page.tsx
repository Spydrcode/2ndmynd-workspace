import Link from "next/link";
import { ArrowRight, UploadCloud, Video } from "lucide-react";

import { PageHeader } from "@/src/components/workspace/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getStore } from "@/src/lib/intelligence/store";

export default async function AppHomePage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const store = getStore();
  const workspace = user ? await store.ensureWorkspaceForUser(user.id, user.email) : null;
  const runs = workspace ? await store.listRuns(workspace.id) : [];
  const latest = runs[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Latest snapshot"
        subtitle="Finite decision artifacts: one conclusion, a boundary, and the next step to take."
        actions={
          <Button asChild>
            <Link href="/app/upload">
              Upload exports
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Most recent run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {latest ? (
              <>
                <p>
                  Run ID:{" "}
                  <span className="font-mono text-foreground">{latest.run_id}</span>
                </p>
                <p>Status: {latest.status}</p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/results/${latest.run_id}`}>Open results</Link>
                </Button>
              </>
            ) : (
              <p>No runs yet. Upload exports to generate your first snapshot.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Quick actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <Button asChild className="w-full justify-start" variant="outline">
              <Link href="/app/connect">
                <UploadCloud className="mr-2 h-4 w-4" />
                Connect & Upload
              </Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link href="/app/remote-assist">
                <Video className="mr-2 h-4 w-4" />
                Remote Assist
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              What you get
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Business summary from your site.</p>
            <p>2. One-sentence pattern.</p>
            <p>3. Clear next step with boundary.</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              No dashboards
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>We only surface the latest snapshot.</p>
            <p>Re-run when you want a fresh read.</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Quiet, practical tone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Finite artifacts, not monitoring.</p>
            <p>Clarity over volume.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
