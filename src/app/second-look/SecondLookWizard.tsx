"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import type { SecondLookArtifactV2 } from "@/src/lib/second_look_v2/contracts/second_look_artifact_v2";
import type {
  OwnerValueEnum,
  PressureSourceEnum,
  SecondLookIntakeV2,
} from "@/src/lib/second_look_v2/contracts/second_look_intake_v2";

type RunOption = {
  run_id: string;
  created_at: string | null;
  status: string | null;
};

type WizardProps = {
  runOptions: RunOption[];
  initialRunId: string;
  initialArtifact: SecondLookArtifactV2 | null;
};

const OWNER_VALUE_OPTIONS: Array<{ value: OwnerValueEnum; label: string }> = [
  { value: "safety_compliance", label: "Safety / Compliance" },
  { value: "customer_communication", label: "Customer Communication" },
  { value: "reliability_ontime", label: "Reliability / On-Time" },
  { value: "reputation_reviews", label: "Reputation / Reviews" },
  { value: "team_stability", label: "Team Stability" },
  { value: "cash_stability", label: "Cash Stability" },
  { value: "growth", label: "Growth" },
  { value: "quality_craftsmanship", label: "Quality Craftsmanship" },
  { value: "speed", label: "Speed" },
  { value: "simplicity", label: "Simplicity" },
  { value: "premium_positioning", label: "Premium Positioning" },
  { value: "community_relationships", label: "Community Relationships" },
];

const PRESSURE_OPTIONS: Array<{ value: PressureSourceEnum; label: string }> = [
  { value: "customers_expectations", label: "Customer Expectations" },
  { value: "scheduling_dispatch", label: "Scheduling / Dispatch" },
  { value: "quality_callbacks", label: "Quality Callbacks" },
  { value: "team_hiring_training", label: "Hiring / Training" },
  { value: "sales_followup", label: "Sales Follow-up" },
  { value: "vendors_inventory", label: "Vendors / Inventory" },
  { value: "compliance_risk", label: "Compliance Risk" },
  { value: "owner_interruptions", label: "Owner Interruptions" },
  { value: "tools_message_overload", label: "Message Overload" },
  { value: "cash_timing", label: "Cash Timing" },
];

const ROLE_OPTIONS: Array<SecondLookIntakeV2["emyth_role_split"]> = [
  "technician",
  "manager",
  "entrepreneur",
  "mixed",
];

const SNAPSHOT_WINDOW_OPTIONS: Array<SecondLookIntakeV2["snapshot_window"]["mode"]> = [
  "last_90_days",
  "last_100_closed_estimates",
];

function toggleWithLimit<T extends string>(current: T[], value: T, limit: number): T[] {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  if (current.length >= limit) {
    return current;
  }
  return [...current, value];
}

function formatRunLabel(run: RunOption): string {
  if (!run.created_at) return `${run.run_id} (${run.status ?? "unknown"})`;
  const date = new Date(run.created_at);
  const dateLabel = Number.isNaN(date.getTime()) ? run.created_at : date.toLocaleString();
  return `${run.run_id} (${run.status ?? "unknown"}, ${dateLabel})`;
}

function moduleConclusionText(artifact: SecondLookArtifactV2): string {
  return `${artifact.primary_constraint.statement} Choose ${artifact.decision_paths.path_A.label} or ${artifact.decision_paths.path_B.label} this cycle.`;
}

export default function SecondLookWizard({ runOptions, initialRunId, initialArtifact }: WizardProps) {
  const [step, setStep] = useState(1);
  const [sourceRunId, setSourceRunId] = useState(initialRunId);
  const [businessName, setBusinessName] = useState(initialArtifact?.meta.business_name ?? "");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState("");
  const [snapshotMode, setSnapshotMode] = useState<SecondLookIntakeV2["snapshot_window"]["mode"]>("last_90_days");
  const [ownerValues, setOwnerValues] = useState<OwnerValueEnum[]>(
    initialArtifact?.north_star.values_top3 ?? []
  );
  const [pressures, setPressures] = useState<PressureSourceEnum[]>([]);
  const [roleSplit, setRoleSplit] = useState<SecondLookIntakeV2["emyth_role_split"]>("mixed");
  const [voiceNote1, setVoiceNote1] = useState("");
  const [voiceNote2, setVoiceNote2] = useState("");
  const [optionalTagsRaw, setOptionalTagsRaw] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<SecondLookArtifactV2 | null>(initialArtifact);
  const [generatedRunId, setGeneratedRunId] = useState<string>(initialRunId || "");

  const progress = useMemo(() => Math.round((step / 6) * 100), [step]);

  async function handleGenerate() {
    setError(null);

    if (!sourceRunId) {
      setError("Select a source run first.");
      return;
    }
    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    if (ownerValues.length < 1 || ownerValues.length > 3) {
      setError("Pick 1 to 3 owner values.");
      return;
    }
    if (pressures.length < 1 || pressures.length > 2) {
      setError("Pick 1 to 2 pressure sources.");
      return;
    }

    const optionalTags = optionalTagsRaw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const intake: SecondLookIntakeV2 = {
      business_name: businessName.trim(),
      website_url: websiteUrl.trim() || undefined,
      google_business_url: googleBusinessUrl.trim() || undefined,
      snapshot_window: { mode: snapshotMode },
      owner_values_top3: ownerValues,
      pressure_sources_top2: pressures,
      emyth_role_split: roleSplit,
      voice_note_1_text: voiceNote1.trim() || undefined,
      voice_note_2_text: voiceNote2.trim() || undefined,
      optional_tags: optionalTags.length ? optionalTags : undefined,
      consent_flags: { data_ok: true },
    };

    setBusy(true);
    try {
      const response = await fetch("/api/second-look", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_run_id: sourceRunId, intake }),
      });

      const json = (await response.json()) as {
        ok?: boolean;
        message?: string;
        run_id?: string;
        second_look_artifact_v2?: SecondLookArtifactV2 | null;
      };

      if (!response.ok || !json.ok || !json.second_look_artifact_v2) {
        throw new Error(json.message ?? "Could not generate Second Look artifact.");
      }

      setArtifact(json.second_look_artifact_v2);
      if (json.run_id) {
        setGeneratedRunId(json.run_id);
      }
      setStep(6);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not generate artifact.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyTalkTrack() {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.talk_track_90s);
      setCopyState("Talk track copied");
      setTimeout(() => setCopyState(null), 1500);
    } catch {
      setCopyState("Copy failed");
      setTimeout(() => setCopyState(null), 1500);
    }
  }

  const canGoBack = step > 1;
  const canGoNext = step < 6;

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-border/60 bg-background/95">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Guided Capture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Step {step} of 6</p>
          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground/80" style={{ width: `${progress}%` }} />
          </div>
        </CardContent>
      </Card>

      {step === 1 ? (
        <Card className="rounded-2xl border border-border/60 bg-background/95">
          <CardHeader>
            <CardTitle className="text-base font-semibold">1. Business Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Source run (required)</p>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={sourceRunId}
                onChange={(event) => setSourceRunId(event.target.value)}
              >
                <option value="">Select a run</option>
                {runOptions.map((run) => (
                  <option key={run.run_id} value={run.run_id}>
                    {formatRunLabel(run)}
                  </option>
                ))}
              </select>
            </div>

            <Input
              placeholder="Business name"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
            <Input
              placeholder="Website URL (optional)"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
            />
            <Input
              placeholder="Google Business URL (optional)"
              value={googleBusinessUrl}
              onChange={(event) => setGoogleBusinessUrl(event.target.value)}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SNAPSHOT_WINDOW_OPTIONS.map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={snapshotMode === mode ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setSnapshotMode(mode)}
                >
                  {mode === "last_90_days" ? "Last 90 Days" : "Last 100 Closed Estimates"}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="rounded-2xl border border-border/60 bg-background/95">
          <CardHeader>
            <CardTitle className="text-base font-semibold">2. Values (Pick Top 3)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Selected: {ownerValues.length} / 3</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {OWNER_VALUE_OPTIONS.map((option) => {
                const selected = ownerValues.includes(option.value);
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    className="min-h-11 justify-start text-left"
                    onClick={() => setOwnerValues((current) => toggleWithLimit(current, option.value, 3))}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="rounded-2xl border border-border/60 bg-background/95">
          <CardHeader>
            <CardTitle className="text-base font-semibold">3. Pressure (Pick Top 2)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Selected: {pressures.length} / 2</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PRESSURE_OPTIONS.map((option) => {
                const selected = pressures.includes(option.value);
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    className="min-h-11 justify-start text-left"
                    onClick={() => setPressures((current) => toggleWithLimit(current, option.value, 2))}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card className="rounded-2xl border border-border/60 bg-background/95">
          <CardHeader>
            <CardTitle className="text-base font-semibold">4. E-Myth Role Split</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.map((role) => (
              <Button
                key={role}
                type="button"
                variant={roleSplit === role ? "default" : "outline"}
                className="justify-start capitalize"
                onClick={() => setRoleSplit(role)}
              >
                {role}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card className="rounded-2xl border border-border/60 bg-background/95">
          <CardHeader>
            <CardTitle className="text-base font-semibold">5. Voice Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Voice note 1 (typed/transcribed)"
              value={voiceNote1}
              onChange={(event) => setVoiceNote1(event.target.value)}
              rows={4}
            />
            <Textarea
              placeholder="Voice note 2 (typed/transcribed)"
              value={voiceNote2}
              onChange={(event) => setVoiceNote2(event.target.value)}
              rows={4}
            />
            <Input
              placeholder="Optional tags (comma separated)"
              value={optionalTagsRaw}
              onChange={(event) => setOptionalTagsRaw(event.target.value)}
            />
            <Button type="button" disabled={busy} onClick={handleGenerate} className="w-full">
              {busy ? "Generating..." : "Generate Second Look"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 6 ? (
        <Card className="rounded-2xl border border-border/60 bg-background/95">
          <CardHeader>
            <CardTitle className="text-base font-semibold">6. Second Look Artifact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!artifact ? (
              <p className="text-muted-foreground">Generate the artifact to review results.</p>
            ) : (
              <>
                <div className="rounded-lg border border-border/70 p-3">
                  <p className="text-xs uppercase text-muted-foreground">One Clear Conclusion</p>
                  <p className="mt-1 text-foreground">{moduleConclusionText(artifact)}</p>
                </div>

                <div className="rounded-lg border border-border/70 p-3">
                  <p className="text-xs uppercase text-muted-foreground">Primary Constraint</p>
                  <p className="mt-1 text-foreground">{artifact.primary_constraint.statement}</p>
                  <p className="mt-1 text-muted-foreground">{artifact.primary_constraint.why_this}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Path A</p>
                    <p className="mt-1 font-medium">{artifact.decision_paths.path_A.label}</p>
                    <p className="mt-1 text-muted-foreground">{artifact.decision_paths.path_A.thesis}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Path B</p>
                    <p className="mt-1 font-medium">{artifact.decision_paths.path_B.label}</p>
                    <p className="mt-1 text-muted-foreground">{artifact.decision_paths.path_B.thesis}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 p-3">
                  <p className="text-xs uppercase text-muted-foreground">Neither / Pause</p>
                  <p className="mt-1 text-muted-foreground">{artifact.decision_paths.neither.copy}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-xs uppercase text-muted-foreground">7-Day Plan</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                      {artifact.plan.actions_7_days.map((action) => (
                        <li key={action.install_id}>{action.what}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-xs uppercase text-muted-foreground">30-Day Plan</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                      {artifact.plan.actions_30_days.map((action) => (
                        <li key={action.install_id}>{action.what}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 p-3">
                  <p className="text-xs uppercase text-muted-foreground">Boundaries</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {artifact.plan.boundaries.map((boundary) => (
                      <li key={boundary}>{boundary}</li>
                    ))}
                  </ul>
                </div>

                <Separator />

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={handleCopyTalkTrack}>
                    Copy Talk Track
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!generatedRunId}
                    onClick={() => {
                      if (!generatedRunId) return;
                      window.open(`/second-look/${generatedRunId}/print`, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Download PDF
                  </Button>
                  {copyState ? <p className="text-xs text-muted-foreground">{copyState}</p> : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" disabled={!canGoBack || busy} onClick={() => setStep((s) => Math.max(1, s - 1))}>
          Back
        </Button>
        <Button type="button" disabled={!canGoNext || busy} onClick={() => setStep((s) => Math.min(6, s + 1))}>
          Next
        </Button>
      </div>
    </div>
  );
}
