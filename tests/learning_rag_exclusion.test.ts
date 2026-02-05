import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { captureTrainingExample } from "../src/lib/learning/capture";
import { SIGNALS_V1_KEYS } from "../src/lib/learning/signals_v1";

const RAG_MARKER = "RAG_EXCLUSION_MARKER";

describe("Learning safety invariant", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-safe-"));
    process.env.LEARNING_CAPTURE = "true";
    process.env.LEARNING_STORE_ROOT = tempDir;
    process.env.LEARNING_VECTOR_BACKEND = "none";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("excludes RAG context from captured training examples", async () => {
    const analysis = {
      run_id: "rag-safe-run",
      input_hash: "hash",
      snapshot: {
        snapshot_version: "snapshot_v2",
        pii_scrubbed: true,
        window: {
          slice_start: "2025-01-01",
          slice_end: "2025-03-31",
          report_date: "2025-03-31",
          lookback_days: 90,
          sample_confidence: "high",
          window_type: "last_90_days",
        },
        exclusions: {
          quotes_outside_window_count: 2,
          invoices_outside_window_count: 1,
          calendar_outside_window_count: 0,
        },
        activity_signals: {
          quotes: {
            quotes_count: 10,
            quotes_approved_count: 6,
            approval_rate_band: "medium",
            decision_lag_band: "medium",
            quote_total_bands: { small: 3, medium: 4, large: 3 },
          },
          invoices: {
            invoices_count: 8,
            invoices_paid_count: 5,
            invoice_total_bands: { small: 2, medium: 3, large: 3 },
            payment_lag_band_distribution: { very_low: 1, low: 2, medium: 3, high: 1, very_high: 1 },
          },
        },
        volatility_band: "medium",
        season: { phase: "Active", strength: "moderate", predictability: "medium" },
        input_costs: [],
      },
      conclusion: null,
      pipeline_meta: null,
      validation: { ok: true, errors: [] },
      business_profile: {
        name_guess: null,
        summary: "Local HVAC service company",
        services: ["maintenance"],
        location_mentions: [],
        industry_bucket: "trade",
        domain: "example.com",
        found_contact: false,
      },
      input_recognition: {
        quotes_detected_count: 10,
        invoices_detected_count: 8,
        invoices_paid_detected_count: 5,
        calendar_detected_count: 4,
        reasons_dropped: [],
        files_attempted: [],
        by_type: {
          quotes: {
            files_seen: 1,
            rows_total: 10,
            rows_parsed: 10,
            rows_in_window: 10,
            rows_outside_window: 2,
            date_parse_success_count: 10,
            date_parse_fail_count: 0,
            drop_reasons_top3: [],
          },
          invoices: {
            files_seen: 1,
            rows_total: 9,
            rows_parsed: 9,
            rows_in_window: 8,
            rows_outside_window: 1,
            date_parse_success_count: 9,
            date_parse_fail_count: 0,
            drop_reasons_top3: [],
          },
        },
        layer_coverage: {
          intent: true,
          billing: true,
          capacity: true,
          cash: false,
          cost: false,
          crm: false,
        },
        readiness: "ready",
      },
      run_manifest: {
        run_id: "rag-safe-run",
        workspace_id: "mock-workspace",
        mode: "mock",
        created_at: new Date().toISOString(),
        steps: [],
      },
      readiness_level: "ready",
      diagnose_mode: false,
      layer_coverage: undefined,
      layer_fusion: {
        computed_at: new Date().toISOString(),
        lookback_days: 90,
        coverage: { intent: true, billing: true, capacity: true, cash: true, cost: false, crm: false },
        linkage: { linkage_weak: false },
        timing: {
          quote_created_to_approved_p50_days: 5,
          approved_to_scheduled_p50_days: 7,
          scheduled_to_invoiced_p50_days: 3,
          invoiced_to_paid_p50_days: 20,
        },
        pressure_patterns: [{ id: "followup_drift", severity: "high", statement: "", evidence: [] }],
        recommended_focus: "follow_up",
        warnings: [],
        summary: { quotes_recognized: 10, invoices_recognized: 8, calendar_recognized: 4 },
      },
      benchmarks: undefined,
      mapping_confidence: "low",
      decision_artifact: {
        version: "v1",
        takeaway: "",
        why_heavy: "",
        next_7_days: [],
        boundary: "Confirm mapping accuracy before proceeding.",
        window: {
          start_date: "2025-01-01",
          end_date: "2025-03-31",
          rule: "last_90_days",
          excluded_counts: { quotes_outside_window: 2, invoices_outside_window: 1, calendar_outside_window: 0 },
        },
        confidence: { level: "low", reason: "Mapping gaps" },
        pressure_map: [
          {
            key: "follow_up_drift",
            label: "Follow up drift",
            sentence: "",
            recommended_move: "",
            boundary: "",
          },
        ],
      },
      rag_context: {
        context: `Injected context ${RAG_MARKER}`,
        sources: [],
      },
    };

    await captureTrainingExample({
      analysis_result: analysis as any,
      source: "mock",
      industry_key: "hvac",
    });

    const examplesPath = path.join(process.env.LEARNING_STORE_ROOT!, "examples.jsonl");
    const jsonl = fs.readFileSync(examplesPath, "utf-8").trim().split(/\r?\n/);
    const last = JSON.parse(jsonl[jsonl.length - 1]);

    const featureKeys = Object.keys(last.features ?? {});
    expect(featureKeys.every((key) => SIGNALS_V1_KEYS.includes(key))).toBe(true);
    expect(JSON.stringify(last.features)).not.toContain(RAG_MARKER);
    expect(featureKeys.some((key) => key.toLowerCase().startsWith("rag"))).toBe(false);
  });
});
