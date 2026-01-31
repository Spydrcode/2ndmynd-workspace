"use client";

import { useState } from "react";

import { createSupabaseBrowserClient } from "@/src/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleSend = async () => {
    setStatus("idle");
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("sent");
      setMessage("Check your inbox for the magic link.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(1000px_circle_at_top,_rgba(15,23,42,0.08),_transparent_60%)] px-4 py-12">
      <div className="mx-auto max-w-md">
        <Card className="rounded-2xl border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-xl">Welcome back</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              We use a magic link so you can return to your workspace without a
              password.
            </p>
            <Input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button onClick={handleSend} className="w-full">
              Send magic link
            </Button>
            {message ? (
              <Alert variant={status === "error" ? "destructive" : "default"}>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
