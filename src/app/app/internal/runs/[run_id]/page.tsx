"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DecisionArtifactDiff } from "../../components/DecisionArtifactDiff";
import type { DecisionArtifactV1 } from "@/src/lib/types/decision_artifact";

type ArtifactResponse = {
  decision_artifact: DecisionArtifactV1;
  meta: {
    run_id: string;
    created_at?: string | null;
    industry_key?: string | null;
    source?: string | null;
    inference_enabled: boolean;
    model_version?: string | null;
    embedding_model?: string | null;
  };
};

type SimilarItem = {
  id: string;
  run_id: string;
  industry_key?: string;
  created_at?: string;
  score: number;
  pressure_keys?: string[];
  boundary_class?: string;
  embedding_model?: string;
};

type ReportMeta = {
  path: string;
  url: string;
  model_name?: string;
  updated_at?: string;
};

export default function InternalRunPage({ params }: { params: { run_id: string } }) {
  const searchParams = useSearchParams();
  const internal = searchParams.get("internal") === "1";
  const tokenParam = searchParams.get("token");
  const [token, setToken] = useState<string | null>(null);

  const [baseline, setBaseline] = useState<ArtifactResponse | null>(null);
  const [learned, setLearned] = useState<ArtifactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [similarResults, setSimilarResults] = useState<SimilarItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [filterModel, setFilterModel] = useState<string>("");

  const [compareMode, setCompareMode] = useState<"baseline" | "learned">("learned");
  const [compareRunId, setCompareRunId] = useState<string | null>(null);
  const [compareArtifact, setCompareArtifact] = useState<ArtifactResponse | null>(null);

  const [latestReports, setLatestReports] = useState<ReportMeta[]>([]);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const authHeaders = useMemo(() => {
    return token ? { "x-2ndmynd-internal": token } : undefined;
  }, [token]);

  useEffect(() => {
    if (tokenParam) {
      localStorage.setItem("internal_token", tokenParam);
      setToken(tokenParam);
    } else {
      setToken(localStorage.getItem("internal_token"));
    }
  }, [tokenParam]);

  useEffect(() => {
    if (!internal) return;
    setLoading(true);
    setError(null);
    const fetchArtifacts = async () => {
      const [baselineRes, learnedRes] = await Promise.all([
        fetch(`/api/internal/runs/artifacts?run_id=${params.run_id}&mode=baseline&internal=1`, {
          headers: authHeaders,
        }),
        fetch(`/api/internal/runs/artifacts?run_id=${params.run_id}&mode=learned&internal=1`, {
          headers: authHeaders,
        }),
      ]);
      if (!baselineRes.ok || !learnedRes.ok) {
        throw new Error("Failed to load artifacts");
      }
      const baselineData = (await baselineRes.json()) as ArtifactResponse;
      const learnedData = (await learnedRes.json()) as ArtifactResponse;
      setBaseline(baselineData);
      setLearned(learnedData);
    };
    fetchArtifacts()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load artifacts");
      })
      .finally(() => setLoading(false));
  }, [params.run_id, internal, authHeaders]);

  useEffect(() => {
    if (!internal) return;
    fetch("/api/internal/learning/reports/latest?internal=1", { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.reports) setLatestReports(data.reports as ReportMeta[]);
      })
      .catch(() => undefined);
  }, [internal, authHeaders]);

  const handleFindSimilar = async () => {
    setIsSearching(true);
    try {
      const response = await fetch("/api/internal/learning/similar?internal=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders ?? {}) },
        body: JSON.stringify({
          run_id: params.run_id,
          topK: 8,
          filter_model: filterModel || undefined,
        }),
      });
      if (!response.ok) throw new Error("Failed to find similar runs");
      const data = await response.json();
      setSimilarResults(data.results ?? []);
    } catch (__err) {
      setSimilarResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (!compareRunId) {
      setCompareArtifact(null);
      return;
    }
    const mode = compareMode;
    fetch(`/api/internal/runs/artifacts?run_id=${compareRunId}&mode=${mode}&internal=1`, { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCompareArtifact(data))
      .catch(() => setCompareArtifact(null));
  }, [compareRunId, compareMode, authHeaders]);

  if (!internal) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="pt-6">
            <Alert>
              <AlertDescription>Internal mode required. Add ?internal=1 to the URL.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const leftForCompare = compareMode === "learned" ? learned?.decision_artifact : baseline?.decision_artifact;
  const leftLabel = compareMode === "learned" ? "Current (learned)" : "Current (baseline)";

  const baselinePressures = baseline?.decision_artifact?.pressure_map?.map((p) => p.key).join(", ") || "\u2014";
  const learnedPressures = learned?.decision_artifact?.pressure_map?.map((p) => p.key).join(", ") || "\u2014";

  const buildMarkdownDiff = () => {
    if (!baseline || !learned) return "";
    const left = baseline.decision_artifact;
    const right = learned.decision_artifact;
    return [
      `# Decision Artifact Diff`,
      ``,
      `## One clear takeaway`,
      `- Baseline: ${left.takeaway}`,
      `- Learned: ${right.takeaway}`,
      ``,
      `## Why it likely feels heavy`,
      `- Baseline: ${left.why_heavy}`,
      `- Learned: ${right.why_heavy}`,
      ``,
      `## What to do next (7 days)`,
      `- Baseline: ${left.next_7_days.join("; ") || "\u2014"}`,
      `- Learned: ${right.next_7_days.join("; ") || "\u2014"}`,
      ``,
      `## Boundary`,
      `- Baseline: ${left.boundary ?? "\u2014"}`,
      `- Learned: ${right.boundary ?? "\u2014"}`,
      ``,
      `## Pressure map`,
      `- Baseline: ${left.pressure_map.map((p) => p.key).join(", ") || "\u2014"}`,
      `- Learned: ${right.pressure_map.map((p) => p.key).join(", ") || "\u2014"}`,
    ].join("\n");
  };

  const handleCopyMarkdown = async () => {
    const markdown = buildMarkdownDiff();
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyStatus("Copied");
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus("Copy failed");
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Internal Run View</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">run_id</Badge>
            <span className="font-mono text-xs">{params.run_id}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {baseline?.meta?.industry_key ? <Badge variant="secondary">{baseline.meta.industry_key}</Badge> : null}
            {baseline?.meta?.source ? <Badge variant="outline">{baseline.meta.source}</Badge> : null}
            {baseline?.meta?.created_at ? <span>{baseline.meta.created_at}</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/results/${params.run_id}?internal=1`}>Open Results</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={handleFindSimilar} disabled={isSearching}>
              {isSearching ? "Searching\u2026" : "Fetch Similar Runs"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {baseline && learned && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Diff Context</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
            <div className="rounded border p-3">
              <div className="text-xs text-muted-foreground">Baseline</div>
              <div>Inference: off</div>
              <div>Model version: {baseline.meta.model_version ?? "n/a"}</div>
              <div>Embedding model: {baseline.meta.embedding_model ?? "n/a"}</div>
              <div>Pressures: {baselinePressures}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-muted-foreground">Learned</div>
              <div>Inference: on</div>
              <div>Model version: {learned.meta.model_version ?? "n/a"}</div>
              <div>Embedding model: {learned.meta.embedding_model ?? "n/a"}</div>
              <div>Pressures: {learnedPressures}</div>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleCopyMarkdown}>
                Copy diff as markdown
              </Button>
              {copyStatus ? <span className="text-xs text-muted-foreground">{copyStatus}</span> : null}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">Loading artifacts\u2026</CardContent>
        </Card>
      )}

      {baseline && learned && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Baseline vs Learned (same run)</CardTitle>
          </CardHeader>
          <CardContent>
            <DecisionArtifactDiff
              left={baseline.decision_artifact}
              right={learned.decision_artifact}
              leftLabel="Baseline"
              rightLabel="Learned"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Similar Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Filter embedding model</Label>
              <Input
                placeholder="text-embedding-3-small"
                value={filterModel}
                onChange={(e) => setFilterModel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Compare mode</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={compareMode === "baseline" ? "default" : "outline"}
                  onClick={() => setCompareMode("baseline")}
                >
                  Baseline
                </Button>
                <Button
                  size="sm"
                  variant={compareMode === "learned" ? "default" : "outline"}
                  onClick={() => setCompareMode("learned")}
                >
                  Learned
                </Button>
              </div>
            </div>
          </div>

          {similarResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No similar runs loaded yet.</p>
          ) : (
            <div className="space-y-2">
              {similarResults.map((item) => (
                <div key={item.id} className="rounded border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{item.run_id}</span>
                    <Badge variant="outline">{item.score.toFixed(3)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.industry_key ?? "unknown"} \u2022 {item.created_at ?? "n/a"}
                  </div>
                  {item.embedding_model && (
                    <div className="text-xs text-muted-foreground">model: {item.embedding_model}</div>
                  )}
                  {item.pressure_keys && item.pressure_keys.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      pressures: {item.pressure_keys.join(", ")}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => setCompareRunId(item.run_id)}>
                      Compare
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/app/internal/runs/${item.run_id}?internal=1`}>Open</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {compareRunId && leftForCompare && compareArtifact?.decision_artifact && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Compare to {compareRunId} ({compareMode})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DecisionArtifactDiff
              left={leftForCompare}
              right={compareArtifact.decision_artifact}
              leftLabel={leftLabel}
              rightLabel={`Similar (${compareMode})`}
            />
          </CardContent>
        </Card>
      )}

      {latestReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Latest Evaluation Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {latestReports.map((report) => (
              <div key={report.path} className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {report.model_name ?? "model"} \u2022 {report.updated_at ?? ""}
                </div>
                <Button asChild size="sm" variant="outline">
                  <a href={report.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Separator />
    </div>
  );
}
