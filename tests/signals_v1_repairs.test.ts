/**
 * Tests for signals_v1 dead feature repairs and missingness flags
 */

import { describe, it, expect } from "vitest";
import { extractSignalsV1, SIGNALS_V1_KEYS } from "../src/lib/learning/signals_v1";
import type { AnalysisResult } from "../src/lib/intelligence/run_analysis";

describe("signals_v1 feature extraction", () => {
  it("should not include removed features in schema", () => {
    const keys = Array.from(SIGNALS_V1_KEYS);
    
    // Verify removed features are not in schema
    expect(keys).not.toContain("weekend_share");
    expect(keys).not.toContain("stale_quotes_share_14d");
    expect(keys).not.toContain("duplicate_id_rate");
    
    // Verify kept features are still present
    expect(keys).toContain("has_amounts");
    expect(keys).toContain("has_decision_lag");
    expect(keys).toContain("has_approved_to_scheduled");
    expect(keys).toContain("has_invoiced_to_paid");
    expect(keys).toContain("has_rhythm");
    expect(keys).toContain("has_open_quotes");
  });
  
  it("should compute active_days_count from window", () => {
    const mockAnalysis: Partial<AnalysisResult> = {
      run_id: "test",
      snapshot: {
        snapshot_version: "snapshot_v2",
        window: {
          lookback_days: 90,
          slice_start: "2024-01-01",
          slice_end: "2024-03-31",
          report_date: "2024-03-31",
          sample_confidence: "high",
          window_type: "last_90_days",
        },
        activity_signals: {
          quotes: {
            quotes_count: 10,
            quotes_approved_count: 8,
            approval_rate_band: "medium",
            decision_lag_band: "medium",
            quote_total_bands: { small: 3, medium: 4, large: 3 },
          },
          invoices: {
            invoices_count: 5,
            invoices_paid_count: 4,
            invoice_total_bands: { small: 2, medium: 2, large: 1 },
            payment_lag_band_distribution: {
              very_low: 1,
              low: 2,
              medium: 1,
              high: 0,
              very_high: 0,
            },
          },
        },
        volatility_band: "medium",
        season: {
          phase: "Active",
          strength: "moderate",
          predictability: "medium",
        },
        pii_scrubbed: true,
        input_costs: [],
      },
      run_manifest: {
        run_id: "test",
        workspace_id: "test_workspace",
        mode: "mock",
        steps: [],
        created_at: "2024-03-31",
      },
      business_profile: {
        name_guess: "Test Business",
        summary: "",
        services: [],
        location_mentions: [],
        industry_bucket: "service",
        domain: null,
        found_contact: false,
        website_present: false,
        opportunity_signals: {
          has_phone: false,
          has_email: false,
          has_booking_cta: false,
          has_financing: false,
          has_reviews: false,
          has_service_pages: false,
          has_maintenance_plan: false,
        },
      },
      validation: { ok: true, errors: [] },
    };
    
    const { features } = extractSignalsV1(mockAnalysis as AnalysisResult);
    
    expect(features.active_days_count).toBe(90);
    expect(features.quotes_per_active_day).toBeCloseTo(10 / 90, 4);
    expect(features.invoices_per_active_day).toBeCloseTo(5 / 90, 4);
  });
  
  it("should compute p90 lags from p50 values", () => {
    const mockAnalysis: Partial<AnalysisResult> = {
      run_id: "test",
      layer_fusion: {
        computed_at: "2024-03-31",
        lookback_days: 90,
        coverage: {
          intent: true,
          billing: true,
          capacity: true,
          cash: true,
          cost: false,
          crm: false,
        },
        timing: {
          quote_created_to_approved_p50_days: 5,
          approved_to_scheduled_p50_days: 3,
          invoiced_to_paid_p50_days: 15,
        },
        linkage: {
          linkage_weak: false,
        },
        pressure_patterns: [],
        recommended_focus: "collections",
        warnings: [],
        summary: {
          quotes_recognized: 10,
          invoices_recognized: 5,
          calendar_recognized: 8,
        },
      },
      snapshot: {
        snapshot_version: "snapshot_v2",
        window: {
          lookback_days: 90,
          slice_start: "2024-01-01",
          slice_end: "2024-03-31",
          report_date: "2024-03-31",
          sample_confidence: "high",
          window_type: "last_90_days",
        },
        activity_signals: {
          quotes: {
            quotes_count: 10,
            quotes_approved_count: 8,
            approval_rate_band: "medium",
            decision_lag_band: "medium",
            quote_total_bands: { small: 0, medium: 0, large: 0 },
          },
          invoices: {
            invoices_count: 5,
            invoices_paid_count: 4,
            invoice_total_bands: { small: 0, medium: 0, large: 0 },
            payment_lag_band_distribution: {
              very_low: 0,
              low: 0,
              medium: 0,
              high: 0,
              very_high: 0,
            },
          },
        },
        volatility_band: "medium",
        season: {
          phase: "Active",
          strength: "moderate",
          predictability: "medium",
        },
        pii_scrubbed: true,
        input_costs: [],
      },
      run_manifest: {
        run_id: "test",
        workspace_id: "test_workspace",
        mode: "mock",
        steps: [],
        created_at: "2024-03-31",
      },
      business_profile: {
        name_guess: "Test Business",
        summary: "",
        services: [],
        location_mentions: [],
        industry_bucket: "service",
        domain: null,
        found_contact: false,
        website_present: false,
        opportunity_signals: {
          has_phone: false,
          has_email: false,
          has_booking_cta: false,
          has_financing: false,
          has_reviews: false,
          has_service_pages: false,
          has_maintenance_plan: false,
        },
      },
      validation: { ok: true, errors: [] },
    };
    
    const { features } = extractSignalsV1(mockAnalysis as AnalysisResult);
    
    // p90 should be estimated as p50 * 1.5, capped at 120
    expect(features.decision_lag_days_p50).toBe(5);
    expect(features.decision_lag_days_p90).toBe(7.5);
    expect(features.has_decision_lag).toBe(1);
    
    expect(features.approved_to_scheduled_days_p50).toBe(3);
    expect(features.approved_to_scheduled_days_p90).toBe(4.5);
    expect(features.has_approved_to_scheduled).toBe(1);
    
    expect(features.invoiced_to_paid_days_p50).toBe(15);
    expect(features.invoiced_to_paid_days_p90).toBe(22.5);
    expect(features.has_invoiced_to_paid).toBe(1);
  });
  
  it("should compute invoice amount features from bands", () => {
    const mockAnalysis: Partial<AnalysisResult> = {
      run_id: "test",
      snapshot: {
        snapshot_version: "snapshot_v2",
        window: {
          lookback_days: 90,
          slice_start: "2024-01-01",
          slice_end: "2024-03-31",
          report_date: "2024-03-31",
          sample_confidence: "high",
          window_type: "last_90_days",
        },
        activity_signals: {
          quotes: {
            quotes_count: 0,
            quotes_approved_count: 0,
            approval_rate_band: "medium",
            decision_lag_band: "medium",
            quote_total_bands: { small: 0, medium: 0, large: 0 },
          },
          invoices: {
            invoices_count: 10,
            invoices_paid_count: 8,
            invoice_total_bands: { small: 3, medium: 5, large: 2 },
            payment_lag_band_distribution: {
              very_low: 0,
              low: 0,
              medium: 0,
              high: 0,
              very_high: 0,
            },
          },
        },
        volatility_band: "medium",
        season: {
          phase: "Active",
          strength: "moderate",
          predictability: "medium",
        },
        pii_scrubbed: true,
        input_costs: [],
      },
      run_manifest: {
        run_id: "test",
        workspace_id: "test_workspace",
        mode: "mock",
        steps: [],
        created_at: "2024-03-31",
      },
      business_profile: {
        name_guess: "Test Business",
        summary: "",
        services: [],
        location_mentions: [],
        industry_bucket: "service",
        domain: null,
        found_contact: false,        website_present: false,
        opportunity_signals: {
          has_phone: false,
          has_email: false,
          has_booking_cta: false,
          has_financing: false,
          has_reviews: false,
          has_service_pages: false,
          has_maintenance_plan: false,
        },      },
      validation: { ok: true, errors: [] },
    };
    
    const { features } = extractSignalsV1(mockAnalysis as AnalysisResult);
    
    // Should compute amount features from bands
    expect(features.has_amounts).toBe(1);
    expect(features.invoice_total_sum_log).not.toBeNull();
    expect(features.invoice_total_p50_log).not.toBeNull();
    expect(features.invoice_total_p90_log).not.toBeNull();
    
    // Should compute concentration metrics
    expect(features.mid_ticket_share).toBeCloseTo(0.5, 1); // 5/10
    expect(features.gini_proxy).toBeCloseTo(0.2, 1); // 2/10
  });
  
  it("should handle missing data gracefully", () => {
    const minimalAnalysis: Partial<AnalysisResult> = {
      run_id: "test",
      run_manifest: {
        run_id: "test",
        workspace_id: "test_workspace",
        mode: "mock",
        steps: [],
        created_at: "2024-03-31",
      },
      business_profile: {
        name_guess: "Test Business",
        summary: "",
        services: [],
        location_mentions: [],
        industry_bucket: "service",
        domain: null,
        found_contact: false,
        website_present: false,
        opportunity_signals: {
          has_phone: false,
          has_email: false,
          has_booking_cta: false,
          has_financing: false,
          has_reviews: false,
          has_service_pages: false,
          has_maintenance_plan: false,
        },
      },
      validation: { ok: true, errors: [] },
    };

    const { features } = extractSignalsV1(minimalAnalysis as AnalysisResult);
    
    expect(features.industry_key).toBe("unknown");
    expect(features.source).toBe("mock");
  });
});
