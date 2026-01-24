"use client";

import { useEffect, useMemo, useState } from "react";

import { sampleSnapshot } from "@/lib/sampleSnapshot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type DecisionResult =
  | {
      ok: true;
      model: string;
      conclusion: {
        one_sentence_pattern: string;
        decision: string;
        boundary: string;
        why_this_now: string;
        confidence: "low" | "medium" | "high";
      };
    }
  | { ok: false; code: string; message: string };

type DecisionDiag = {
  env: {
    SUPABASE_URL: string | null;
    DECISION_MODEL_ID_set: boolean;
    SUPABASE_SERVICE_ROLE_KEY_set?: boolean;
  };
  registry: {
    found: boolean;
    model_id: string | null;
  };
  runs: {
    latest_succeeded_found: boolean;
    result_model: string | null;
  };
  error?: string;
};

export default function DecisionLabPage() {
  const defaultPayload = useMemo(
    () => JSON.stringify({ input_snapshot: sampleSnapshot }, null, 2),
    []
  );
  const [payload, setPayload] = useState(defaultPayload);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState<DecisionDiag | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [modelId, setModelId] = useState(
    "ft:gpt-4o-mini-2024-07-18:personal:2ndmynd-train-v3:D0yFqIDW"
  );
  const [devToken, setDevToken] = useState("");
  const [settingModel, setSettingModel] = useState(false);
  const [devStatus, setDevStatus] = useState<string | null>(null);

  const fetchDiag = async () => {
    setDiagLoading(true);
    try {
      const response = await fetch("/api/decision/diag");
      const data = (await response.json()) as DecisionDiag;
      setDiag(data);
    } catch {
      setDiag({
        env: { SUPABASE_URL: null, DECISION_MODEL_ID_set: false },
        registry: { found: false, model_id: null },
        runs: { latest_succeeded_found: false, result_model: null },
        error: "Unable to load diagnostics.",
      });
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    fetchDiag();
  }, []);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = (await response.json()) as DecisionResult;
      setResult(data);
    } catch {
      setResult({
        ok: false,
        code: "NETWORK_ERROR",
        message: "Unable to reach the decision service.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSample = () => {
    setPayload(defaultPayload);
    setResult(null);
  };

  const handleSetModel = async () => {
    setSettingModel(true);
    setDevStatus(null);
    try {
      const response = await fetch("/api/decision/dev/set-model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dev-admin-token": devToken,
        },
        body: JSON.stringify({ model_id: modelId }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };
      if (!data.ok || !response.ok) {
        setResult({
          ok: false,
          code: "MODEL_SET_FAILED",
          message: data.message ?? "Unable to set active model.",
        });
        setDevStatus(data.message ?? "Unable to set active model.");
      } else {
        setDevStatus("Active model updated.");
      }
    } catch {
      setResult({
        ok: false,
        code: "MODEL_SET_FAILED",
        message: "Unable to set active model.",
      });
      setDevStatus("Unable to set active model.");
    } finally {
      setSettingModel(false);
      fetchDiag();
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_circle_at_top,_rgba(15,23,42,0.08),_transparent_60%)] px-6 py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Decision Lab
          </p>
          <h1 className="text-3xl font-semibold text-foreground">
            One clear next step
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Paste a snapshot or use the sample to get a single pattern, decision, and
            boundary.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Input snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                className="min-h-[320px] font-mono text-xs"
                value={payload}
                onChange={(event) => setPayload(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleRun} disabled={loading}>
                  {loading ? "Running..." : "Run 2nd Look"}
                </Button>
                <Button variant="ghost" onClick={handleSample} disabled={loading}>
                  Load Sample
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Conclusion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!result && (
                <p className="text-sm text-muted-foreground">
                  Run the model to see a clean conclusion here.
                </p>
              )}
              {result?.ok && (
                <div className="space-y-4 text-sm text-foreground">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Pattern
                  </p>
                  <p className="text-sm">{result.conclusion.one_sentence_pattern}</p>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Decision
                    </p>
                    <h2 className="text-xl font-semibold">
                      {result.conclusion.decision}
                    </h2>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Boundary
                    </p>
                    <p className="text-sm">{result.conclusion.boundary}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Why this now
                    </p>
                    <p className="text-sm">{result.conclusion.why_this_now}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Confidence
                    </span>
                    <Badge variant="secondary">
                      {result.conclusion.confidence}
                    </Badge>
                  </div>
                </div>
              )}
              {result && !result.ok && (
                <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Unable to complete.</p>
                  <p>{result.message}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Diagnostics</CardTitle>
            <Button
              variant="ghost"
              onClick={fetchDiag}
              disabled={diagLoading}
            >
              {diagLoading ? "Refreshing..." : "Refresh Diagnostics"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {!diag && <p>Loading diagnostics...</p>}
            {diag && (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">SUPABASE_URL</Badge>
                  <span>{diag.env.SUPABASE_URL ?? "missing"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">DECISION_MODEL_ID</Badge>
                  <span>{diag.env.DECISION_MODEL_ID_set ? "set" : "not set"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">SERVICE_ROLE_KEY</Badge>
                  <span>
                    {diag.env.SUPABASE_SERVICE_ROLE_KEY_set ? "set" : "not set"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Registry</Badge>
                  <span>
                    {diag.registry.found
                      ? diag.registry.model_id
                      : "active model not found"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Runs</Badge>
                  <span>
                    {diag.runs.latest_succeeded_found
                      ? diag.runs.result_model
                      : "no succeeded run found"}
                  </span>
                </div>
                {diag.error && <span>{diag.error}</span>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Set Active Model (Dev)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Model ID
              </label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                placeholder="ft:..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Dev Admin Token
              </label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
                value={devToken}
                onChange={(event) => setDevToken(event.target.value)}
                placeholder="local-dev"
              />
            </div>
            <Button onClick={handleSetModel} disabled={settingModel}>
              {settingModel ? "Setting..." : "Set Active Model (Dev)"}
            </Button>
            {devStatus && <p className="text-xs text-muted-foreground">{devStatus}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
