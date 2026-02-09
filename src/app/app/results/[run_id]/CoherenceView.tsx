"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type {
  PresentedCoherenceArtifact,
  PresentedTension,
  PresentedPath,
  PresentedAlignment,
  PresentedDataCoverage,
  PresentedDrift,
} from "@/src/lib/present/present_coherence";

type CoherenceViewProps = {
  artifact: PresentedCoherenceArtifact;
  isDev?: boolean;
  /** Callback when owner confirms or adjusts a low/med confidence value. */
  onConfirmValue?: (tag: string, confirmed: boolean) => void;
};

function severityColor(label: PresentedTension["severity_label"]): string {
  switch (label) {
    case "high":
      return "border-red-400/60 bg-red-50/40 dark:bg-red-950/20";
    case "significant":
      return "border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20";
    case "moderate":
      return "border-yellow-400/40 bg-yellow-50/20 dark:bg-yellow-950/10";
    default:
      return "border-emerald-400/40 bg-emerald-50/30 dark:bg-emerald-950/20";
  }
}

function severityDot(label: PresentedTension["severity_label"]): string {
  switch (label) {
    case "high":
      return "bg-red-500";
    case "significant":
      return "bg-amber-500";
    case "moderate":
      return "bg-yellow-500";
    default:
      return "bg-emerald-500";
  }
}

function SeverityBar({ severity }: { severity: number }) {
  const barColor =
    severity >= 75
      ? "bg-red-500"
      : severity >= 50
        ? "bg-amber-500"
        : severity >= 25
          ? "bg-yellow-500"
          : "bg-emerald-500";

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-2 w-full max-w-32 overflow-hidden rounded-full bg-muted/40">
        <div
          className={`absolute left-0 top-0 h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(severity, 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{severity}/100</span>
    </div>
  );
}

function effortBadge(effort: string) {
  const variant = effort === "high" ? "destructive" : effort === "med" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="text-xs capitalize">
      {effort} effort
    </Badge>
  );
}

function supportBadgeColor(support: string): string {
  switch (support) {
    case "supported":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "mixed":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    case "crowded_out":
      return "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400";
  }
}

function confidenceBadgeColor(confidence: string): string {
  switch (confidence) {
    case "high":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
    case "med":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300";
    default:
      return "bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400";
  }
}

function AlignmentCard({ item }: { item: PresentedAlignment }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/80 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{item.label}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${supportBadgeColor(item.support)}`}
          >
            {item.support_label}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceBadgeColor(item.confidence)}`}
          >
            {item.confidence_label}
          </span>
        </div>
      </div>
      <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
        {item.evidence_bullets.map((bullet, i) => (
          <li key={i} className="leading-relaxed">
            {bullet}
          </li>
        ))}
      </ul>
      {item.support === "unknown" && item.unknown_helper && (
        <p className="text-xs text-muted-foreground/70 italic pl-4">
          {item.unknown_helper}
        </p>
      )}
      {item.gentle_check && (
        <div className="rounded-lg bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/30 dark:border-amber-800/20 p-2.5 mt-1">
          <p className="text-xs text-amber-700 dark:text-amber-400 italic">{item.gentle_check}</p>
        </div>
      )}
    </div>
  );
}

function coverageStatusDot(status: string): string {
  switch (status) {
    case "present":
      return "bg-emerald-500";
    case "partial":
      return "bg-amber-500";
    default:
      return "bg-gray-400";
  }
}

function visibilityBadgeColor(visibility: string): string {
  switch (visibility) {
    case "clear":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "partial":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400";
  }
}

function DataCoverageCard({ coverage }: { coverage: PresentedDataCoverage }) {
  return (
    <Card className="rounded-2xl border border-border/60 bg-background/90">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{coverage.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{coverage.overall_note}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {coverage.sources.map((source) => (
            <div
              key={source.name}
              className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/10 p-3"
            >
              <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${coverageStatusDot(source.status)}`} />
              <div>
                <p className="text-xs font-medium text-foreground capitalize">{source.name}</p>
                <p className="text-xs text-muted-foreground">{source.note}</p>
              </div>
            </div>
          ))}
        </div>
        {coverage.visibility_impacts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              How this affects what we can see:
            </p>
            {coverage.visibility_impacts
              .filter((v) => v.visibility !== "clear")
              .map((v) => (
                <div key={v.tag} className="flex items-center justify-between gap-2 px-2">
                  <span className="text-xs text-foreground">{v.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${visibilityBadgeColor(v.visibility)}`}
                    >
                      {v.visibility_label}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmationHook({
  item,
  onConfirm,
}: {
  item: PresentedAlignment;
  onConfirm?: (tag: string, confirmed: boolean) => void;
}) {
  if (!item.needs_confirmation || !onConfirm) return null;

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
      <p className="text-xs text-muted-foreground flex-1">
        Is this still a priority for you?
      </p>
      <button
        type="button"
        onClick={() => onConfirm(item.tag, true)}
        className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60 transition-colors"
      >
        Yes, keep it
      </button>
      <button
        type="button"
        onClick={() => onConfirm(item.tag, false)}
        className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:hover:bg-gray-800/60 transition-colors"
      >
        It shifted
      </button>
    </div>
  );
}

function DriftSection({ drift }: { drift: PresentedDrift }) {
  const hasAlignmentChanges = drift.alignment_changes.some((c) => c.direction !== "unchanged");
  const hasTensionChanges = drift.tension_changes.some((c) => c.direction !== "unchanged");

  return (
    <Card className="rounded-2xl border border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{drift.title}</CardTitle>
        <p className="text-xs text-muted-foreground">{drift.days_between} days since last analysis</p>
        <p className="text-sm text-muted-foreground leading-relaxed mt-1">{drift.summary}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasAlignmentChanges && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Value alignment shifts:</p>
            {drift.alignment_changes
              .filter((c) => c.direction !== "unchanged")
              .map((change, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/10 p-2.5">
                  <span className="text-xs text-foreground">{change.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{change.prior}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="text-[10px] text-muted-foreground">{change.current}</span>
                    <Badge
                      variant={change.direction === "improved" ? "default" : change.direction === "declined" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {change.direction_label}
                    </Badge>
                  </div>
                </div>
              ))}
          </div>
        )}

        {hasTensionChanges && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Tension shifts:</p>
            {drift.tension_changes
              .filter((c) => c.direction !== "unchanged")
              .map((change, i) => (
                <div key={i} className="rounded-lg border border-border/40 bg-muted/10 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground">{change.intent_anchor}</span>
                    <Badge
                      variant={change.direction === "eased" ? "default" : change.direction === "worsened" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {change.direction_label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{change.note}</p>
                </div>
              ))}
          </div>
        )}

        {drift.structural_notes.length > 0 && (
          <div className="space-y-1">
            {drift.structural_notes.map((note, i) => (
              <p key={i} className="text-xs text-muted-foreground">• {note}</p>
            ))}
          </div>
        )}

        {drift.what_to_decide_now && (
          <div className="rounded-lg bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/30 dark:border-amber-800/20 p-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Worth considering:
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
              {drift.what_to_decide_now}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TensionCard({ tension }: { tension: PresentedTension }) {
  return (
    <div className={`rounded-xl border p-4 ${severityColor(tension.severity_label)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${severityDot(tension.severity_label)}`}
          />
          <p className="text-sm font-medium text-foreground">{tension.intent_anchor}</p>
        </div>
        <Badge variant="outline" className="text-xs capitalize whitespace-nowrap">
          {tension.severity_label}
        </Badge>
      </div>
      <p className="mt-2 pl-4.5 text-sm text-muted-foreground leading-relaxed">{tension.claim}</p>
      <div className="mt-3 pl-4.5">
        <SeverityBar severity={tension.severity} />
      </div>
      <div className="mt-3 pl-4.5 rounded-lg bg-background/60 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Why this happens:</span> {tension.mechanism}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">What it costs you:</span> {tension.owner_cost}
        </p>
      </div>
      {tension.what_must_be_true.length > 0 && (
        <div className="mt-3 pl-4.5">
          <p className="text-xs font-medium text-foreground mb-1">
            For this to change, these conditions help:
          </p>
          <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
            {tension.what_must_be_true.map((item, i) => (
              <li key={i} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PathCard({ path }: { path: PresentedPath }) {
  const borderColor =
    path.name === "path_A"
      ? "border-primary/30"
      : path.name === "path_B"
        ? "border-secondary/30"
        : "border-muted/30";

  return (
    <Card className={`rounded-2xl border-2 ${borderColor}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{path.label}</CardTitle>
          {path.name === "neither" && (
            <Badge variant="outline" className="text-xs">
              Do nothing
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{path.thesis}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Protects */}
        <div>
          <p className="text-xs font-medium text-foreground mb-1">This path protects:</p>
          <div className="flex flex-wrap gap-1.5">
            {path.protects.map((p, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {p}
              </Badge>
            ))}
          </div>
        </div>

        {/* Value anchors - protects_values */}
        {path.protects_values && path.protects_values.length > 0 && (
          <div className="rounded-lg bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/30 dark:border-emerald-800/20 p-2.5">
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 mb-1">
              Values this protects:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {path.protects_values.map((v, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Value anchors - relaxes_values */}
        {path.relaxes_values && path.relaxes_values.length > 0 && (
          <div className="rounded-lg bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/30 dark:border-amber-800/20 p-2.5">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
              Values this relaxes:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {path.relaxes_values.map((v, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Trades off */}
        <div>
          <p className="text-xs font-medium text-foreground mb-1">You accept:</p>
          <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
            {path.trades_off.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>

        {/* 7-day plan */}
        {path.seven_day_steps.length > 0 && (
          <div>
            <Separator className="my-2" />
            <p className="text-xs font-medium text-foreground mb-2">First 7 days:</p>
            <div className="space-y-3">
              {path.seven_day_steps.map((step, i) => (
                <div key={i} className="rounded-lg border border-border/40 bg-muted/10 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground">
                      {i + 1}. {step.title}
                    </p>
                    {effortBadge(step.effort)}
                  </div>
                  <p className="text-xs text-muted-foreground">{step.why}</p>
                  <p className="text-xs text-muted-foreground mt-1 italic">How: {step.how}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 30-day followup */}
        <div className="rounded-lg bg-muted/20 p-3">
          <p className="text-xs font-medium text-foreground">At 30 days: {path.thirty_day_followup.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{path.thirty_day_followup.why}</p>
        </div>

        {/* Boundary warning */}
        <div className="flex items-start gap-2">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">⚠</span>
          <p className="text-xs text-muted-foreground italic">{path.boundary_warning}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CoherenceView({ artifact, isDev = false, onConfirmValue }: CoherenceViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">{artifact.headline}</h2>
          <p className="text-sm text-muted-foreground">{artifact.subheadline}</p>
        </div>
        <Badge
          variant={
            artifact.confidence.level === "high"
              ? "default"
              : artifact.confidence.level === "med"
                ? "secondary"
                : "outline"
          }
          className="capitalize"
        >
          {artifact.confidence.level} confidence
        </Badge>
      </div>

      {/* Drift section (monthly review — shown at top when present) */}
      {artifact.drift_section && <DriftSection drift={artifact.drift_section} />}

      {/* Intent summary */}
      <Card className="rounded-2xl border border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Your stated intent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground leading-relaxed">
            {artifact.intent_summary.value_proposition}
          </p>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Priorities (most → least):</p>
            <div className="flex flex-wrap gap-1.5">
              {artifact.intent_summary.priorities.map((p, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {i + 1}. {p}
                </Badge>
              ))}
            </div>
          </div>
          {artifact.intent_summary.non_negotiables.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Non-negotiables:</p>
              <div className="flex flex-wrap gap-1.5">
                {artifact.intent_summary.non_negotiables.map((nn, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {nn}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {artifact.intent_summary.contradictions &&
            artifact.intent_summary.contradictions.length > 0 && (
              <div className="rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 p-3">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                  Worth noting:
                </p>
                {artifact.intent_summary.contradictions.map((c, i) => (
                  <p key={i} className="text-xs text-amber-600 dark:text-amber-300">
                    {c}
                  </p>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Signal overview */}
      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">What the data shows</CardTitle>
          <p className="text-xs text-muted-foreground">
            {artifact.signal_overview.total_records} records · {artifact.signal_overview.window}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {artifact.signal_overview.highlights.map((h, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed">
              • {h}
            </p>
          ))}
          {artifact.signal_overview.missing_data.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground italic">
              Limited data: {artifact.signal_overview.missing_data.join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Coverage Card (above alignment) */}
      {artifact.data_coverage_card && (
        <DataCoverageCard coverage={artifact.data_coverage_card} />
      )}

      {/* Value-Prop Alignment */}
      {artifact.alignment_section && artifact.alignment_section.items.length > 0 && (
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {artifact.alignment_section.title}
            </CardTitle>
            {artifact.alignment_summary && (
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {artifact.alignment_summary.split(/\*\*([^*]+)\*\*/g).map((part, i) =>
                  i % 2 === 1 ? (
                    <strong key={i} className="font-semibold text-foreground">
                      {part}
                    </strong>
                  ) : (
                    part
                  )
                )}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {artifact.alignment_section.items.map((item) => (
              <div key={item.tag}>
                <AlignmentCard item={item} />
                <ConfirmationHook item={item} onConfirm={onConfirmValue} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tensions */}
      {artifact.tension_cards.length > 0 && (
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Where your intent and reality don&apos;t match
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {artifact.tension_cards.map((t) => (
              <TensionCard key={t.id} tension={t} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Decision Paths */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-foreground">Two paths forward (and one exit)</h3>
        <p className="text-sm text-muted-foreground">
          Choose the path that best matches what you&apos;re willing to do right now.
          &ldquo;Neither&rdquo; is always a valid choice.
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {artifact.path_cards.map((p) => (
            <PathCard key={p.name} path={p} />
          ))}
        </div>
      </div>

      {/* Dev details */}
      {isDev && (
        <Accordion type="multiple" className="space-y-4">
          <AccordionItem
            value="raw"
            className="rounded-2xl border border-border/60 bg-background/90 px-6"
          >
            <AccordionTrigger className="hover:no-underline">
              <CardTitle className="text-base font-semibold">Raw coherence data (dev)</CardTitle>
            </AccordionTrigger>
            <AccordionContent className="pb-6">
              <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/20 p-3 font-mono text-xs text-foreground">
                {JSON.stringify(artifact, null, 2)}
              </pre>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
