"use client";

/**
 * INTERNAL ONLY - Testing page for manual mock runs
 * 
 * Allows internal users to trigger full end-to-end mock pipeline:
 * - Search for business website
 * - Scrape context
 * - Generate CSV bundle
 * - Run analysis pipeline
 * - View results in standard results page
 * 
 * Access: Requires NEXT_PUBLIC_INTERNAL_TESTING=true
 */

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Play, AlertTriangle, Brain } from "lucide-react";

interface JobStatus {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  progress: {
    step: string;
    pct?: number;
  };
  website?: string;
  bundle_zip?: string;
  run_id?: string;
  validation?: {
    ok: boolean;
    errors: string[];
  };
  error?: string;
  started_at?: string;
  completed_at?: string;
}

interface LearningJobStatus {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  model_name: string;
  examples_count?: number;
  model_version?: string;
  model_versions?: Record<string, string | undefined>;
  metrics?: Record<string, number>;
  report_path?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

interface DatasetStats {
  exists: boolean;
  total_count: number;
  mock_count: number;
  real_count: number;
  labeled_count: number;
  industries: Record<string, number>;
  earliest_date?: string;
  latest_date?: string;
}

interface ReportMeta {
  path: string;
  url: string;
  model_name?: string;
  updated_at?: string;
}

export default function TestingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isEnabled, setIsEnabled] = useState(false);
  const [internalToken, setInternalToken] = useState<string | null>(null);

  // Form state
  const [industry, setIndustry] = useState<string>("hvac");
  const [seed, setSeed] = useState<string>("");
  const [days, setDays] = useState<string>("90");
  const [websiteUrl, setWebsiteUrl] = useState<string>("");

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Learning state
  const [datasetStats, setDatasetStats] = useState<DatasetStats | null>(null);
  const [learningJobId, setLearningJobId] = useState<string | null>(null);
  const [learningStatus, setLearningStatus] = useState<LearningJobStatus | null>(null);
  const [isPollingLearning, setIsPollingLearning] = useState(false);
  const [captureLearning, setCaptureLearning] = useState(false);
  const [autoLabel, setAutoLabel] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [similarResults, setSimilarResults] = useState<any[]>([]);
  const [isSearchingSimilar, setIsSearchingSimilar] = useState(false);
  const [latestReports, setLatestReports] = useState<ReportMeta[]>([]);

  // Check if internal testing is enabled
  useEffect(() => {
    const enabled = process.env.NEXT_PUBLIC_INTERNAL_TESTING === "true";
    const hasInternalParam = searchParams.get("internal") === "1";
    
    setIsEnabled(enabled || hasInternalParam);
    setInternalToken(localStorage.getItem("internal_token"));
    
    // Load dataset stats on mount
    if (enabled || hasInternalParam) {
      fetchDatasetStats();
      fetchLatestReports();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Poll for status updates
  useEffect(() => {
    if (!jobId || !isPolling) return;

    const poll = async () => {
      try {
        const response = await fetch(`/api/internal/mock-run/status?job_id=${jobId}`, {
          headers: internalToken ? { "x-2ndmynd-internal": internalToken } : undefined,
        });
        
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.statusText}`);
        }

        const data = await response.json();
        setStatus(data);

        // Stop polling if done or error
        if (data.status === "done" || data.status === "error") {
          setIsPolling(false);
        }
      } catch (err) {
        console.error("Polling error:", err);
        setError(err instanceof Error ? err.message : "Failed to check status");
        setIsPolling(false);
      }
    };

    // Initial poll
    poll();

    // Set up interval
    const interval = setInterval(poll, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [jobId, isPolling, internalToken]);

  // Poll for learning job status
  useEffect(() => {
    if (!learningJobId || !isPollingLearning) return;

    const poll = async () => {
      try {
        const response = await fetch(`/api/internal/learning/status?job_id=${learningJobId}`, {
          headers: internalToken ? { "x-2ndmynd-internal": internalToken } : undefined,
        });
        
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.statusText}`);
        }

        const data = await response.json();
        setLearningStatus(data);

        // Stop polling if done or error
        if (data.status === "done" || data.status === "error") {
          setIsPollingLearning(false);
          // Refresh dataset stats
          fetchDatasetStats();
        }
      } catch (err) {
        console.error("Learning polling error:", err);
        setIsPollingLearning(false);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learningJobId, isPollingLearning, internalToken]);

  // Fetch dataset stats
  const fetchDatasetStats = async () => {
    try {
      const response = await fetch("/api/internal/learning/dataset", {
        headers: internalToken ? { "x-2ndmynd-internal": internalToken } : undefined,
      });
      if (response.ok) {
        const data = await response.json();
        setDatasetStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch dataset stats:", err);
    }
  };

  const fetchLatestReports = async () => {
    try {
      const response = await fetch("/api/internal/learning/reports/latest?internal=1", {
        headers: internalToken ? { "x-2ndmynd-internal": internalToken } : undefined,
      });
      if (response.ok) {
        const data = await response.json();
        setLatestReports(data.reports ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    }
  };

  // Handle form submission
  const handleRunTest = async () => {
    setError(null);
    setJobId(null);
    setStatus(null);

    try {
      const response = await fetch("/api/internal/mock-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalToken ? { "x-2ndmynd-internal": internalToken } : {}),
        },
        body: JSON.stringify({
          industry,
          seed: seed ? parseInt(seed) : undefined,
          days: parseInt(days),
          capture_learning: captureLearning,
          auto_label: autoLabel,
          website_url: websiteUrl.trim() ? websiteUrl.trim() : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start job");
      }

      const data = await response.json();
      setJobId(data.job_id);
      setIsPolling(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start test");
    }
  };

  // Handle learning training
  const handleTrainModels = async () => {
    setLearningJobId(null);
    setLearningStatus(null);

    try {
      const response = await fetch("/api/internal/learning/train", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalToken ? { "x-2ndmynd-internal": internalToken } : {}),
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start training");
      }

      const data = await response.json();
      setLearningJobId(data.job_id);
      setIsPollingLearning(true);
    } catch (err) {
      console.error("Training error:", err);
      setError(err instanceof Error ? err.message : "Failed to start training");
    }
  };

  // Handle view results
  const handleViewResults = () => {
    if (status?.run_id) {
      router.push(`/app/results/${status.run_id}?internal=1`);
    }
  };

  const handleFindSimilar = async () => {
    if (!status?.run_id) return;
    setIsSearchingSimilar(true);
    try {
      const response = await fetch("/api/internal/learning/similar?internal=1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalToken ? { "x-2ndmynd-internal": internalToken } : {}),
        },
        body: JSON.stringify({ run_id: status.run_id, topK: 5 }),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch similar examples");
      }
      const data = await response.json();
      setSimilarResults(data.results ?? []);
    } catch (err) {
      console.error("Similar search error:", err);
      setSimilarResults([]);
    } finally {
      setIsSearchingSimilar(false);
    }
  };

  // Render gating
  if (!isEnabled) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="pt-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Internal testing is not enabled. Set NEXT_PUBLIC_INTERNAL_TESTING=true or add ?internal=1 to URL.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Internal Testing</h1>
          <p className="text-muted-foreground mt-2">
            Run full end-to-end mock pipeline: website search → scrape → generate → analyze
          </p>
          <Badge variant="destructive" className="mt-2">INTERNAL ONLY</Badge>
        </div>

        {/* Configuration Form */}
        <Card>
          <CardHeader>
            <CardTitle>Mock Run Configuration</CardTitle>
            <CardDescription>
              Generate a complete mock dataset and run it through the analysis pipeline
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Industry Select */}
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger id="industry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="landscaping">Landscaping</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Seed Input */}
              <div className="space-y-2">
                <Label htmlFor="seed">Seed (optional)</Label>
                <Input
                  id="seed"
                  type="number"
                  placeholder="Random"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  disabled={isPolling}
                />
              </div>

              {/* Days Input */}
              <div className="space-y-2">
                <Label htmlFor="days">Days of Data</Label>
                <Input
                  id="days"
                  type="number"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  disabled={isPolling}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website URL (optional)</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://example.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={isPolling}
              />
              <p className="text-xs text-muted-foreground">
                If provided, the mock run will use this website instead of searching.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="capture-learning"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={captureLearning}
                  onChange={(e) => setCaptureLearning(e.target.checked)}
                  disabled={isPolling}
                />
                <Label htmlFor="capture-learning">Capture learning example</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="auto-label"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={autoLabel}
                  onChange={(e) => setAutoLabel(e.target.checked)}
                  disabled={isPolling}
                />
                <Label htmlFor="auto-label">After run, auto-label</Label>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Run Button */}
            <Button
              onClick={handleRunTest}
              disabled={isPolling}
              className="w-full"
              size="lg"
            >
              {isPolling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Full Mock Test
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Status Display */}
        {status && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Job Status</CardTitle>
                <StatusBadge status={status.status} />
              </div>
              <CardDescription>Job ID: {status.job_id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{status.progress.step}</span>
                  {status.progress.pct !== undefined && (
                    <span className="text-muted-foreground">{status.progress.pct}%</span>
                  )}
                </div>
                {status.progress.pct !== undefined && (
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all duration-300"
                      style={{ width: `${status.progress.pct}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Details Accordion */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="details">
                  <AccordionTrigger>Details</AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    {status.website && (
                      <div>
                        <Label>Website</Label>
                        <p className="text-sm text-muted-foreground break-all">{status.website}</p>
                      </div>
                    )}

                    {status.bundle_zip && (
                      <div>
                        <Label>Bundle</Label>
                        <p className="text-xs text-muted-foreground break-all font-mono">
                          {status.bundle_zip}
                        </p>
                      </div>
                    )}

                    {status.run_id && (
                      <div>
                        <Label>Run ID</Label>
                        <p className="text-sm text-muted-foreground font-mono">{status.run_id}</p>
                      </div>
                    )}

                    {status.validation && (
                      <div>
                        <Label>Validation</Label>
                        <div className="flex items-start gap-2 mt-1">
                          {status.validation.ok ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                          )}
                          <div className="flex-1">
                            {status.validation.ok ? (
                              <p className="text-sm text-green-600">All checks passed</p>
                            ) : (
                              <div className="space-y-1">
                                {status.validation.errors.map((err, i) => (
                                  <p key={i} className="text-sm text-red-600">
                                    • {err}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {status.error && (
                      <div>
                        <Label>Error</Label>
                        <p className="text-sm text-red-600 mt-1">{status.error}</p>
                      </div>
                    )}

                    {status.started_at && (
                      <div>
                        <Label>Started</Label>
                        <p className="text-sm text-muted-foreground">
                          {new Date(status.started_at).toLocaleString()}
                        </p>
                      </div>
                    )}

                    {status.completed_at && (
                      <div>
                        <Label>Completed</Label>
                        <p className="text-sm text-muted-foreground">
                          {new Date(status.completed_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* View Results Button */}
              {status.status === "done" && status.run_id && (
                <Button onClick={handleViewResults} className="w-full" size="lg">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Results
                </Button>
              )}

              {status.status === "done" && status.run_id && (
                <Button
                  onClick={handleFindSimilar}
                  className="w-full"
                  variant="outline"
                  disabled={isSearchingSimilar}
                >
                  {isSearchingSimilar ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Brain className="mr-2 h-4 w-4" />
                  )}
                  Find Similar Examples
                </Button>
              )}

              {similarResults.length > 0 && (
                <div className="space-y-2 text-sm">
                  <Label>Similar Examples</Label>
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {similarResults.map((item: any) => (
                      <div key={item.id} className="rounded border p-2">
                        <div className="flex justify-between">
                          <span className="font-mono text-xs">{item.run_id}</span>
                          <span className="text-xs">{item.score?.toFixed?.(3) ?? item.score}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.industry_key} • {item.created_at}
                        </div>
                        {item.pressure_keys && item.pressure_keys.length > 0 && (
                          <div className="text-xs">pressures: {item.pressure_keys.join(", ")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Help */}
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. <strong>Website Search:</strong> Find a real business website in the selected industry</p>
            <p>2. <strong>Scraping:</strong> Extract business context (name, location, services)</p>
            <p>3. <strong>Data Generation:</strong> Create realistic CSV exports (quotes, invoices, calendar)</p>
            <p>4. <strong>Pipeline Analysis:</strong> Run the full analysis pipeline on generated data</p>
            <p>5. <strong>Results:</strong> View output in the standard results page (like a real client run)</p>
          </CardContent>
        </Card>

        {/* Learning Layer Controls */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              <CardTitle>Learning Layer</CardTitle>
            </div>
            <CardDescription>
              Train models to improve signal calibration, pressure selection, and boundary classification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dataset Stats */}
            {datasetStats && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Training Dataset</Label>
                  {datasetStats.exists ? (
                    <Badge variant="outline" className="text-xs">
                      {datasetStats.total_count} examples
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">No data</Badge>
                  )}
                </div>

                {datasetStats.exists && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Mock runs</p>
                      <p className="font-medium">{datasetStats.mock_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Real runs</p>
                      <p className="font-medium">{datasetStats.real_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Labeled</p>
                      <p className="font-medium">{datasetStats.labeled_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Industries</p>
                      <p className="font-medium">{Object.keys(datasetStats.industries).length}</p>
                    </div>
                  </div>
                )}

                {!datasetStats.exists && (
                  <Alert>
                    <AlertDescription>
                      No training data yet. Enable <code className="text-xs">LEARNING_CAPTURE=true</code> to start capturing examples.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Training Controls */}
            {datasetStats && datasetStats.total_count >= 10 && (
              <div className="space-y-3">
                <Label>Train Models</Label>
                <Button
                  onClick={handleTrainModels}
                  disabled={isPollingLearning}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {isPollingLearning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Brain className="mr-2 h-4 w-4" />
                  )}
                  Train + Evaluate (internal)
                </Button>
              </div>
            )}

            {/* Learning Job Status */}
            {learningStatus && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Training Status</Label>
                  <StatusBadge status={learningStatus.status} />
                </div>

                <div className="text-sm space-y-2">
                  <div>
                    <span className="text-muted-foreground">Model:</span>{" "}
                    <span className="font-medium">{learningStatus.model_name}</span>
                  </div>

                  {learningStatus.examples_count && (
                    <div>
                      <span className="text-muted-foreground">Examples:</span>{" "}
                      <span className="font-medium">{learningStatus.examples_count}</span>
                    </div>
                  )}

                  {learningStatus.model_version && (
                    <div>
                      <span className="text-muted-foreground">Version:</span>{" "}
                      <span className="font-medium">{learningStatus.model_version}</span>
                    </div>
                  )}

                  {learningStatus.model_versions && (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Model Versions:</p>
                      <div className="pl-4 space-y-1">
                        {Object.entries(learningStatus.model_versions).map(([key, value]) => (
                          <p key={key} className="font-mono text-xs">
                            {key}: {value ?? "n/a"}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {learningStatus.metrics && (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Metrics:</p>
                      <div className="pl-4 space-y-1">
                        {Object.entries(learningStatus.metrics).map(([key, value]) => (
                          <p key={key} className="font-mono text-xs">
                            {key}: {typeof value === "number" ? value.toFixed(3) : value}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {learningJobId && learningStatus.report_path && (
                    <div>
                      <span className="text-muted-foreground">Report:</span>{" "}
                      <a
                        href={`/api/internal/learning/report?job_id=${learningJobId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm underline"
                      >
                        Open evaluation report
                      </a>
                    </div>
                  )}

                  {learningStatus.error && (
                    <Alert variant="destructive">
                      <AlertDescription>{learningStatus.error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            )}

            {latestReports.length > 0 && (
              <div className="space-y-2">
                <Label>Latest Evaluation Reports</Label>
                <div className="space-y-2">
                  {latestReports.map((report) => (
                    <div key={report.path} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground text-xs">
                        {report.model_name ?? "model"} â€¢ {report.updated_at ?? ""}
                      </span>
                      <a
                        href={report.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm underline"
                      >
                        Open report
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Instructions */}
            <Alert>
              <AlertDescription className="text-xs">
                <strong>Usage:</strong> Train models after running mock tests. Enable inference with{" "}
                <code>LEARNING_INFERENCE=true</code> to apply learned improvements to the pipeline.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus["status"] }) {
  switch (status) {
    case "queued":
      return <Badge variant="secondary">Queued</Badge>;
    case "running":
      return (
        <Badge variant="secondary">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    case "done":
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Done
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Error
        </Badge>
      );
  }
}
