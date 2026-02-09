/**
 * Unit Tests: Decision Closure Doctrine Enforcement
 * 
 * Tests the core doctrine rules:
 * - Max 2 decision paths
 * - Explicit non-actions required
 * - Forbidden language detection
 * - Clean exit on owner decline
 */

import { describe, it, expect } from "vitest";
import { handler as validateDoctrine } from "../tools/validate_doctrine_v1";
import {
  type DecisionClosureArtifact,
  type DecisionPath,
  checkForbiddenLanguage,
} from "../../schemas/decision_closure";

describe("Doctrine Enforcement Tests", () => {
  describe("Max 2 Decision Paths Rule", () => {
    it("should PASS with 1 decision path", async () => {
      const artifact: Partial<DecisionClosureArtifact> = {
        artifact_version: "closure_v1",
        run_id: "test-001",
        client_id: "test-client-path-1",
        created_at: new Date().toISOString(),
        owner_intent: {
          profile_version: "intent_v1",
          primary_priority: "stability",
          risk_appetite: "low",
          change_appetite: "incremental",
          non_negotiables: [],
          time_horizon: "90_days",
          captured_at: new Date().toISOString(),
        },
        business_reality: {
          model_version: "reality_v1",
          business_type_detected: "test business",
          confidence: "medium",
          concentration_signals: [],
          seasonality_pattern: "none",
          capacity_signals: [],
          owner_dependency: [],
          volatility_drivers: [],
          reconstructed_at: new Date().toISOString(),
        },
        structural_findings: [
          {
            lens: "e_myth",
            finding_id: "test-finding",
            finding_summary: "Test finding",
            severity: "medium",
            evidence: ["test evidence"],
            contributes_to_pressure: true,
          },
        ],
        primary_constraint: {
          constraint_id: "test-constraint",
          constraint_description: "Test constraint",
          downstream_noise: [],
          why_primary: "test reason",
        },
        decision_paths: [
          {
            path_id: "A",
            path_name: "Path A",
            pressure_resolved: "test pressure",
            trade_offs: ["test tradeoff"],
            fits_owner_profile: "fits well",
            proof_of_concept_signals: [
              {
                signal: "test signal",
                time_window_days: 30,
                expected_outcome: "test outcome",
              },
            ],
            exit_conditions: ["test exit"],
            confidence: "medium",
          },
        ],
        commitment_gate: {
          owner_choice: "neither",
          commitment_made: false,
        },
        doctrine_checks: {
          checks_version: "doctrine_v1",
          max_two_paths_enforced: true,
          non_actions_present: false,
          forbidden_language_absent: true,
          commitment_gate_valid: true,
          conclusions_locked_unless_triggered: true,
          all_checks_passed: true,
          failed_checks: [],
        },
        end_state: {
          state: "awaiting_commitment",
          timestamp: new Date().toISOString(),
        },
      };

      const result = await validateDoctrine({ artifact });
      expect(result.valid).toBe(true);
      expect(result.doctrine_checks.max_two_paths_enforced).toBe(true);
    });

    it("should FAIL with 3 decision paths", async () => {
      const pathA: DecisionPath = {
        path_id: "A",
        path_name: "Path A",
        pressure_resolved: "test",
        trade_offs: ["test"],
        fits_owner_profile: "test",
        proof_of_concept_signals: [
          { signal: "test", time_window_days: 30, expected_outcome: "test" },
        ],
        exit_conditions: ["test"],
        confidence: "medium",
      };

      const artifact: Record<string, unknown> = {
        artifact_version: "closure_v1",
        run_id: "test-002",
        created_at: new Date().toISOString(),
        owner_intent: {
          profile_version: "intent_v1",
          primary_priority: "stability",
          risk_appetite: "low",
          change_appetite: "incremental",
          non_negotiables: [],
          time_horizon: "90_days",
          captured_at: new Date().toISOString(),
        },
        business_reality: {
          model_version: "reality_v1",
          business_type_detected: "test",
          confidence: "medium",
          concentration_signals: [],
          seasonality_pattern: "none",
          capacity_signals: [],
          owner_dependency: [],
          volatility_drivers: [],
          reconstructed_at: new Date().toISOString(),
        },
        structural_findings: [],
        primary_constraint: {
          constraint_id: "test",
          constraint_description: "test",
          downstream_noise: [],
          why_primary: "test",
        },
        decision_paths: [pathA, { ...pathA, path_id: "B" }, { ...pathA, path_id: "C" }], // 3 PATHS!
        commitment_gate: {
          owner_choice: "neither",
          commitment_made: false,
        },
        doctrine_checks: {
          checks_version: "doctrine_v1",
          max_two_paths_enforced: false,
          non_actions_present: false,
          forbidden_language_absent: true,
          commitment_gate_valid: true,
          conclusions_locked_unless_triggered: true,
          all_checks_passed: false,
          failed_checks: ["max_two_paths"],
        },
      };

      const result = await validateDoctrine({ artifact, strict: false });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Schema validation failed"))).toBe(true);
    });
  });

  describe("Explicit Non-Actions Required", () => {
    it("should FAIL when committed but no explicit_non_actions", async () => {
      const artifact: Record<string, unknown> = {
        artifact_version: "closure_v1",
        run_id: "test-003",
        created_at: new Date().toISOString(),
        owner_intent: {
          profile_version: "intent_v1",
          primary_priority: "stability",
          risk_appetite: "low",
          change_appetite: "incremental",
          non_negotiables: [],
          time_horizon: "90_days",
          captured_at: new Date().toISOString(),
        },
        business_reality: {
          model_version: "reality_v1",
          business_type_detected: "test",
          confidence: "medium",
          concentration_signals: [],
          seasonality_pattern: "none",
          capacity_signals: [],
          owner_dependency: [],
          volatility_drivers: [],
          reconstructed_at: new Date().toISOString(),
        },
        structural_findings: [],
        primary_constraint: {
          constraint_id: "test",
          constraint_description: "test",
          downstream_noise: [],
          why_primary: "test",
        },
        decision_paths: [
          {
            path_id: "A",
            path_name: "Path A",
            pressure_resolved: "test",
            trade_offs: ["test"],
            fits_owner_profile: "test",
            proof_of_concept_signals: [
              { signal: "test", time_window_days: 30, expected_outcome: "test" },
            ],
            exit_conditions: ["test"],
            confidence: "medium",
          },
        ],
        commitment_gate: {
          owner_choice: "path_A",
          commitment_made: true,
          chosen_at: new Date().toISOString(),
        },
        action_plan: {
          plan_version: "commitment_v1",
          chosen_path: "A",
          time_box_days: 90,
          minimal_actions: [
            {
              action: "test action",
              deadline_days: 30,
              responsible: "owner",
            },
          ],
          explicit_non_actions: [], // EMPTY! SHOULD FAIL
          created_at: new Date().toISOString(),
        },
        doctrine_checks: {
          checks_version: "doctrine_v1",
          max_two_paths_enforced: true,
          non_actions_present: false,
          forbidden_language_absent: true,
          commitment_gate_valid: true,
          conclusions_locked_unless_triggered: true,
          all_checks_passed: false,
          failed_checks: ["non_actions_required"],
        },
      };

      const result = await validateDoctrine({ artifact, strict: false });
      expect(result.valid).toBe(false);
      expect(result.doctrine_checks.non_actions_present).toBe(false);
    });
  });

  describe("Forbidden Language Detection", () => {
    it("should detect forbidden dashboard/KPI language", () => {
      const violations1 = checkForbiddenLanguage("We will build a dashboard for KPI tracking");
      expect(violations1.length).toBeGreaterThan(0);
      expect(violations1.some((v) => v.includes("dashboard"))).toBe(true);
      expect(violations1.some((v) => v.includes("KPI"))).toBe(true);

      const violations2 = checkForbiddenLanguage("Use our BI tool for real-time monitoring");
      expect(violations2.length).toBeGreaterThan(0);

      const violations3 = checkForbiddenLanguage("Deploy data visualization analytics platform");
      expect(violations3.length).toBeGreaterThan(0);
    });

    it("should NOT flag safe decision closure language", () => {
      const violations = checkForbiddenLanguage(
        "Path A resolves owner bottleneck through delegation. Trade-off: upfront time cost."
      );
      expect(violations.length).toBe(0);
    });
  });

  describe("Clean Exit on Owner Decline", () => {
    it("should validate clean exit when owner chooses neither", async () => {
      const artifact: Partial<DecisionClosureArtifact> = {
        artifact_version: "closure_v1",
        run_id: "test-004",
        client_id: "test-client-clean-exit",
        created_at: new Date().toISOString(),
        owner_intent: {
          profile_version: "intent_v1",
          primary_priority: "stability",
          risk_appetite: "low",
          change_appetite: "incremental",
          non_negotiables: [],
          time_horizon: "90_days",
          captured_at: new Date().toISOString(),
        },
        business_reality: {
          model_version: "reality_v1",
          business_type_detected: "test",
          confidence: "medium",
          concentration_signals: [],
          seasonality_pattern: "none",
          capacity_signals: [],
          owner_dependency: [],
          volatility_drivers: [],
          reconstructed_at: new Date().toISOString(),
        },
        structural_findings: [
          {
            lens: "e_myth",
            finding_id: "test-finding-clean-exit",
            finding_summary: "Test finding for clean exit scenario",
            severity: "medium",
            evidence: ["test evidence"],
            contributes_to_pressure: false,
          },
        ],
        primary_constraint: {
          constraint_id: "test",
          constraint_description: "test",
          downstream_noise: [],
          why_primary: "test",
        },
        decision_paths: [
          {
            path_id: "A",
            path_name: "Path A",
            pressure_resolved: "test",
            trade_offs: ["test"],
            fits_owner_profile: "test",
            proof_of_concept_signals: [
              { signal: "test", time_window_days: 30, expected_outcome: "test" },
            ],
            exit_conditions: ["test"],
            confidence: "medium",
          },
        ],
        commitment_gate: {
          owner_choice: "neither",
          commitment_made: false,
          reason_if_declined: "Owner declined to commit",
        },
        // NO action_plan - clean exit
        doctrine_checks: {
          checks_version: "doctrine_v1",
          max_two_paths_enforced: true,
          non_actions_present: false,
          forbidden_language_absent: true,
          commitment_gate_valid: true,
          conclusions_locked_unless_triggered: true,
          all_checks_passed: true,
          failed_checks: [],
        },
        end_state: {
          state: "clean_exit",
          reason: "Owner declined to commit",
          timestamp: new Date().toISOString(),
        },
      };

      const result = await validateDoctrine({ artifact });
      expect(result.valid).toBe(true);
      expect(result.doctrine_checks.commitment_gate_valid).toBe(true);
    });
  });
});
