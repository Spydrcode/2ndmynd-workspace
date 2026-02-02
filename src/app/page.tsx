import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(900px_circle_at_top,_rgba(15,23,42,0.08),_transparent_60%)] px-6">
      <Card className="w-full max-w-xl rounded-2xl border border-border/60 bg-background/90">
        <CardHeader className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            2ndmynd Workspace
          </p>
          <CardTitle className="text-2xl font-semibold">
            Launch Workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            A calm workspace for finite artifacts: one conclusion, a boundary,
            and suggested next steps.
          </p>
          <Button asChild>
            <Link href="/app">Enter workspace</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
