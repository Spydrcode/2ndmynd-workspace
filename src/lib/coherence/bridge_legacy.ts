/**
 * Bridge: CoherenceSnapshot → DecisionClosureArtifact
 *
 * Translates coherence engine output into the legacy artifact schema
 * so commit/review modes and doctrine validator continue to work.
 *
 * This is intentionally lossy — the CoherenceSnapshot is the source of truth.
 * The bridge exists for backward compatibility during migration.
 */

import type { CoherenceSnapshot, CoherenceTension, DecisionPathCoherence } from "../types/coherence_engine";
import type {
  DecisionClosureArtifact,
  OwnerIntentProfile,
  BusinessRealityModel,
  StructuralFinding,
  PrimaryConstraint,
  DecisionPath,
  CommitmentGate,
  DoctrineChecks,
} from "../../../schemas/decision_closure";

export function coherenceToLegacyArtifact(cs: CoherenceSnapshot): DecisionClosureArtifact {
  const ownerIntent = mapOwnerIntent(cs);
  const businessReality = mapBusinessReality(cs);
  const structuralFindings = mapTensionsToFindings(cs.tensions);
  const primaryConstraint = mapPrimaryConstraint(cs.tensions);
  const decisionPaths = mapDecisionPaths(cs.paths);

  const doctrineChecks: DoctrineChecks = {
    checks_version: "doctrine_v1",
    max_two_paths_enforced: decisionPaths.length <= 2,
    non_actions_present: false, // Not committed yet
    forbidden_language_absent: true,
    commitment_gate_valid: true,
    conclusions_locked_unless_triggered: true,
    all_checks_passed: true,
    failed_checks: [],
  };

  return {
    artifact_version: "closure_v1",
    run_id: cs.run_id,
    client_id: cs.run_id, // will be overridden by caller
    created_at: cs.created_at,
    owner_intent: ownerIntent,
    business_reality: businessReality,
    structural_findings: structuralFindings,
    primary_constraint: primaryConstraint,
    decision_paths: decisionPaths,
    commitment_gate: {
      owner_choice: "neither",
      commitment_made: false,
    } as CommitmentGate,
    doctrine_checks: doctrineChecks,
    end_state: cs.end_state,
  };
}

function mapOwnerIntent(cs: CoherenceSnapshot): OwnerIntentProfile {
  const intent = cs.intent;
  // Map rich intent model to the simpler legacy OwnerIntentProfile
  const priorityMap: Record<string, OwnerIntentProfile["primary_priority"]> = {
    stability: "stability",
    profit: "profit",
    growth: "growth",
    time: "time_relief",
    predictability: "predictability",
    stress: "time_relief",
    revenue: "profit",
    safe: "stability",
    scale: "growth",
  };

  let primaryPriority: OwnerIntentProfile["primary_priority"] = "stability";
  const topPriority = intent.priorities_ranked[0]?.toLowerCase() ?? "";
  for (const [keyword, mapped] of Object.entries(priorityMap)) {
    if (topPriority.includes(keyword)) {
      primaryPriority = mapped;
      break;
    }
  }

  // Map risk from boundaries
  let riskAppetite: OwnerIntentProfile["risk_appetite"] = "medium";
  if (intent.boundaries.risk?.toLowerCase().includes("no")) riskAppetite = "low";

  return {
    profile_version: "intent_v1",
    primary_priority: primaryPriority,
    risk_appetite: riskAppetite,
    change_appetite: "incremental",
    non_negotiables: intent.non_negotiables.slice(0, 5),
    time_horizon: "90_days",
    captured_at: intent.captured_at,
  };
}

function mapBusinessReality(cs: CoherenceSnapshot): BusinessRealityModel {
  const signals = cs.signals;
  const concentrationSignals = signals.signals
    .filter((s) => s.category === "concentration")
    .map((s) => ({
      source: (String(s.data_points.source) || "customer") as "customer" | "job_type" | "season",
      concentration_pct: Number(s.data_points.concentration_pct) || 0,
      risk_level: (s.magnitude > 70 ? "high" : s.magnitude > 40 ? "medium" : "low") as "low" | "medium" | "high" | "critical",
      description: s.observation,
    }))
    .slice(0, 5);

  const capacitySignals = signals.signals
    .filter((s) => s.category === "capacity")
    .map((s) => ({
      signal_type: (String(s.data_points.signal_type) || "balanced") as "demand_exceeds_capacity" | "capacity_exceeds_demand" | "balanced",
      severity: (String(s.data_points.severity) || "low") as "low" | "medium" | "high",
      evidence: s.observation,
    }))
    .slice(0, 3);

  const ownerDependency = signals.signals
    .filter((s) => s.category === "owner_dependency")
    .map((s) => ({
      dependency_type: (String(s.data_points.dependency_type) || "approval_bottleneck") as "approval_bottleneck" | "hero_dynamic" | "non_repeatable_work" | "decision_fatigue",
      frequency: (String(s.data_points.frequency) || "occasional") as "occasional" | "frequent" | "constant",
      impact: s.observation,
    }))
    .slice(0, 4);

  const volatilityDrivers = signals.signals
    .filter((s) => s.category === "rhythm")
    .map((s) => s.observation)
    .slice(0, 5);

  const seasonalitySig = signals.signals.find((s) => s.id === "sig_rhythm_seasonality");
  const seasonality = seasonalitySig
    ? ((String(seasonalitySig.data_points.seasonality_pattern) || "none") as "none" | "weak" | "moderate" | "strong")
    : "none";

  return {
    model_version: "reality_v1",
    business_type_detected: "service_business",
    confidence: cs.confidence.level === "high" ? "high" : cs.confidence.level === "med" ? "medium" : "low",
    concentration_signals: concentrationSignals,
    seasonality_pattern: seasonality,
    capacity_signals: capacitySignals,
    owner_dependency: ownerDependency,
    volatility_drivers: volatilityDrivers,
    missing_data_notes: signals.missing_data,
    reconstructed_at: cs.created_at,
  };
}

function mapTensionsToFindings(tensions: CoherenceTension[]): StructuralFinding[] {
  if (tensions.length === 0) {
    return [{
      lens: "e_myth",
      finding_id: "baseline_finding",
      finding_summary: "No critical structural tensions detected",
      severity: "low",
      evidence: ["Business appears to be operating in line with owner intent"],
      contributes_to_pressure: false,
    }];
  }

  return tensions.map((t) => {
    // Map tension to a lens
    const lensMap: Record<string, StructuralFinding["lens"]> = {
      tension_concentration: "blue_ocean",
      tension_cash_timing: "financial_shape",
      tension_owner_dependency: "e_myth",
      tension_capacity_strain: "e_myth",
      tension_volume_rhythm: "financial_shape",
      tension_decision_lag: "porter_lite",
      tension_low_approval: "porter_lite",
    };

    const severity = t.severity >= 75 ? "critical" : t.severity >= 50 ? "high" : t.severity >= 25 ? "medium" : "low";

    return {
      lens: lensMap[t.id] ?? "e_myth",
      finding_id: t.id,
      finding_summary: t.claim,
      severity: severity as "low" | "medium" | "high" | "critical",
      evidence: t.evidence.signal_ids.slice(0, 3),
      contributes_to_pressure: t.severity >= 25,
    };
  }).slice(0, 10);
}

function mapPrimaryConstraint(tensions: CoherenceTension[]): PrimaryConstraint {
  const top = tensions[0];
  if (!top) {
    return {
      constraint_id: "no_tension",
      constraint_description: "No significant tensions detected",
      downstream_noise: [],
      why_primary: "Business appears aligned with owner intent",
    };
  }

  return {
    constraint_id: top.id,
    constraint_description: top.claim,
    downstream_noise: tensions.slice(1, 5).map((t) => t.claim),
    why_primary: `Highest severity (${top.severity}/100). ${top.mechanism}`,
  };
}

function mapDecisionPaths(paths: DecisionPathCoherence[]): [DecisionPath, DecisionPath] {
  const pathA = paths.find((p) => p.name === "path_A");
  const pathB = paths.find((p) => p.name === "path_B");

  const mapPath = (p: DecisionPathCoherence | undefined, id: "A" | "B"): DecisionPath => {
    if (!p) {
      return {
        path_id: id,
        path_name: id === "A" ? "Continue current approach" : "Adjust operations",
        pressure_resolved: "General operational alignment",
        trade_offs: ["Requires ongoing attention"],
        fits_owner_profile: "Aligned with stated priorities",
        proof_of_concept_signals: [{
          signal: "Tension severity remains stable or decreases",
          time_window_days: 30,
          expected_outcome: "Measurable ease in identified tensions",
        }],
        exit_conditions: ["No improvement after 60 days"],
        confidence: "medium",
      };
    }

    return {
      path_id: id,
      path_name: p.thesis.slice(0, 100),
      pressure_resolved: p.protects.join(", "),
      trade_offs: p.trades_off.slice(0, 3),
      fits_owner_profile: `Protects: ${p.protects.join(", ")}`,
      proof_of_concept_signals: p.seven_day_plan.steps.slice(0, 3).map((step) => ({
        signal: step.title,
        time_window_days: 30,
        expected_outcome: step.why,
      })),
      exit_conditions: p.risks.slice(0, 3),
      confidence: "medium",
    };
  };

  return [mapPath(pathA, "A"), mapPath(pathB, "B")];
}
