"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

const DEMO_SHAPES = [
  { id: "typical", label: "Typical", basePath: "/fixtures/snapshot", cohortId: "local_service_general" },
  { id: "small_job_heavy", label: "Small-job heavy", basePath: "/fixtures/snapshot/demo_small_job_heavy", cohortId: "local_service_high_volume" },
  { id: "high_concentration", label: "High concentration", basePath: "/fixtures/snapshot/demo_high_concentration", cohortId: "local_service_project_heavy" },
] as const;
type DemoShapeId = (typeof DEMO_SHAPES)[number]["id"];

export default function SnapshotForm() {
  const router = useRouter();
  const [quotesFile, setQuotesFile] = useState<File | null>(null);
  const [invoicesFile, setInvoicesFile] = useState<File | null>(null);
  const [demoShape, setDemoShape] = useState<DemoShapeId>("typical");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultCohortId = "local_service_general";

  async function fetchDemoFiles(basePath: string) {
    const [quotesRes, invoicesRes] = await Promise.all([
      fetch(`${basePath}/quotes_export.csv`),
      fetch(`${basePath}/invoices_export.csv`),
    ]);

    if (!quotesRes.ok || !invoicesRes.ok) {
      throw new Error("Couldn't load demo data. Try again or upload your CSV exports.");
    }

    const [quotesBlob, invoicesBlob] = await Promise.all([quotesRes.blob(), invoicesRes.blob()]);
    return {
      quotesFile: new File([quotesBlob], "quotes_export.csv", { type: "text/csv" }),
      invoicesFile: new File([invoicesBlob], "invoices_export.csv", { type: "text/csv" }),
    };
  }

  async function handleUseDemo() {
    setSubmitting(true);
    setError(null);
    try {
      const selected = DEMO_SHAPES.find((s) => s.id === demoShape) ?? DEMO_SHAPES[0];
      const demo = await fetchDemoFiles(selected.basePath);
      await runSnapshot({ cohortId: selected.cohortId, quotesFile: demo.quotesFile, invoicesFile: demo.invoicesFile });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't load demo data. Try again or upload your CSV exports."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function runSnapshot(params: {
    quotesFile?: File;
    invoicesFile?: File;
    cohortId: string;
  }) {
    const formData = new FormData();
    formData.set("cohort_id", params.cohortId);
    if (params.quotesFile) formData.set("quotes_csv", params.quotesFile);
    if (params.invoicesFile) formData.set("invoices_csv", params.invoicesFile);

    const ingestRes = await fetch("/api/snapshot/ingest", { method: "POST", body: formData });
    const ingestJson = (await ingestRes.json()) as { runId?: string; message?: string };
    if (!ingestRes.ok || !ingestJson.runId) {
      throw new Error(ingestJson.message ?? "Could not ingest exports.");
    }

    const computeRes = await fetch("/api/snapshot/compute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: ingestJson.runId }),
    });
    const computeJson = (await computeRes.json()) as { resultUrl?: string; message?: string };
    if (!computeRes.ok || !computeJson.resultUrl) {
      throw new Error(computeJson.message ?? "Could not compute snapshot.");
    }

    router.push(computeJson.resultUrl);
  }

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    try {
      await runSnapshot({
        cohortId: defaultCohortId,
        quotesFile: quotesFile ?? undefined,
        invoicesFile: invoicesFile ?? undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Create a Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Upload quotes and invoices exports. You&apos;ll get a one-page snapshot of patterns and where this
            business differs from a typical shape.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="quotes" className="text-xs font-medium text-foreground">
                Quotes CSV
              </label>
              <Input
                id="quotes"
                type="file"
                accept=".csv"
                onChange={(e) => setQuotesFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="invoices" className="text-xs font-medium text-foreground">
                Invoices CSV
              </label>
              <Input
                id="invoices"
                type="file"
                accept=".csv"
                onChange={(e) => setInvoicesFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Privacy note: raw rows are used only to compute the fingerprint, then discarded.
              </p>
              <p className="text-xs text-muted-foreground">
                Demo data is synthetic and only meant to show the shape of the snapshot.
              </p>
              <div className="flex items-center gap-3 text-xs">
                <a
                  className="underline underline-offset-2"
                  href={`${(DEMO_SHAPES.find((s) => s.id === demoShape) ?? DEMO_SHAPES[0]).basePath}/quotes_export.csv`}
                >
                  Download demo quotes CSV
                </a>
                <a
                  className="underline underline-offset-2"
                  href={`${(DEMO_SHAPES.find((s) => s.id === demoShape) ?? DEMO_SHAPES[0]).basePath}/invoices_export.csv`}
                >
                  Download demo invoices CSV
                </a>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Demo shape"
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={demoShape}
                onChange={(e) => setDemoShape(e.target.value as DemoShapeId)}
                disabled={submitting}
              >
                {DEMO_SHAPES.map((shape) => (
                  <option key={shape.id} value={shape.id}>
                    Demo shape: {shape.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" onClick={handleUseDemo} disabled={submitting}>
                {submitting ? "Generating..." : "Use demo data"}
              </Button>
              <Button type="button" onClick={handleGenerate} disabled={submitting}>
                {submitting ? "Generating..." : "Generate snapshot"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
