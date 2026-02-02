"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(1000px_circle_at_top,_rgba(15,23,42,0.08),_transparent_60%)] px-4 py-12">
      <div className="mx-auto max-w-md">
        <Card className="rounded-2xl border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-xl">Login disabled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              This workspace is not gated by login right now. Continue to the app.
            </p>
            <Button asChild className="w-full">
              <Link href="/app">Continue</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
