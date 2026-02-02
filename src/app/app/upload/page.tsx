"use client";

import { useActionState, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, UploadCloud } from "lucide-react";

import { runUploadAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

const TOOL_OPTIONS = [
  "Jobber",
  "QuickBooks",
  "Housecall Pro",
  "ServiceTitan",
  "Other",
] as const;

const EXPORT_CHECKLIST: Record<string, string[]> = {
  Jobber: ["Quotes export", "Invoices export", "Jobs export (optional)"],
  QuickBooks: ["Invoices export", "Estimates export (if used)"],
  "Housecall Pro": ["Estimates export", "Invoices export", "Jobs export"],
  ServiceTitan: ["Estimates export", "Invoices export", "Jobs export"],
  Other: ["Quotes/Estimates export", "Invoices export", "Jobs export (optional)"],
};

type Step = 1 | 2 | 3 | 4;

export default function UploadPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [tool, setTool] = useState<string>("Jobber");
  const [website, setWebsite] = useState<string>(searchParams.get("website") ?? "");
  const [formState, formAction] = useActionState(runUploadAction, {});

  const checklist = useMemo(() => EXPORT_CHECKLIST[tool] ?? EXPORT_CHECKLIST.Other, [tool]);
  const progress = (step / 4) * 100;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="source_tool" value={tool} />
      <input type="hidden" name="website_url" value={website} />

      <Card className="rounded-2xl border border-border/60 bg-background/90">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Upload exports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>We only need a few exports to generate your latest snapshot.</p>
          <Progress value={progress} />
        </CardContent>
      </Card>

      <Tabs value={String(step)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="1" onClick={() => setStep(1)}>
            Tool
          </TabsTrigger>
          <TabsTrigger value="2" onClick={() => setStep(2)}>
            Files
          </TabsTrigger>
          <TabsTrigger value="3" onClick={() => setStep(3)}>
            Website
          </TabsTrigger>
          <TabsTrigger value="4" onClick={() => setStep(4)}>
            Run
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {step === 1 ? (
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Where does your data live?
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOL_OPTIONS.map((option) => (
              <Button
                type="button"
                key={option}
                variant={tool === option ? "default" : "outline"}
                onClick={() => setTool(option)}
              >
                {option}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className={step === 2 ? "block" : "hidden"}>
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Upload your export files
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <p>Checklist for {tool}:</p>
              <ul className="list-disc pl-5">
                {checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/30 p-6 text-center">
              <UploadCloud className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm">
                Drag files here, or click to choose exports.
              </p>
              <Input
                type="file"
                name="exports"
                multiple
                accept=".csv,.xlsx"
                className="mt-4"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {step === 3 ? (
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Business website</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Optional but recommended. We use it for the business summary.</p>
            <Input
              placeholder="https://yourbusiness.com"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card className="rounded-2xl border border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Run my snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>We will normalize your exports and generate a finite decision artifact.</p>
            <Button type="submit">
              Run my snapshot
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Separator />
            <p className="text-xs text-muted-foreground">
              We only surface the latest snapshot, not ongoing monitoring.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {formState?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{formState.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((prev) => (prev > 1 ? ((prev - 1) as Step) : prev))}
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={() => setStep((prev) => (prev < 4 ? ((prev + 1) as Step) : prev))}
        >
          Next
        </Button>
      </div>
    </form>
  );
}
