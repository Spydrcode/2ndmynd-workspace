import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { LayerFusionResult } from "@/src/lib/intelligence/layer_fusion/types";

import type { SecondLookIntakeV2 } from "../contracts/second_look_intake_v2";
import { getModuleById, type ModuleDefinition, type ModuleVariant } from "./module_registry";

export type SelectModulesContext = {
  snapshot?: SnapshotV2;
  layer_fusion?: LayerFusionResult | null;
};

export type SelectedModuleDefinition = ModuleDefinition & {
  variant: ModuleVariant;
};

const ALWAYS_MODULE_IDS: Array<ModuleDefinition["module_id"]> = [
  "emyth_role_relief",
  "porter_value_chain",
  "constructive_installs",
];

const CONDITIONAL_MODULE_PRIORITY: Array<ModuleDefinition["module_id"]> = [
  "safety_risk_protocols",
  "customer_comms_system",
  "dispatch_rhythm",
  "team_handoff_ladder",
  "reputation_promise",
  "cash_timing_relief",
];

function includesAny<T extends string>(input: readonly T[], expected: readonly T[]) {
  return expected.some((value) => input.includes(value));
}

function moduleTriggered(moduleId: ModuleDefinition["module_id"], intake: SecondLookIntakeV2): boolean {
  const moduleDef = getModuleById(moduleId);
  const trigger = moduleDef.triggers;

  if (trigger.always) return true;

  const byValues = trigger.owner_values
    ? includesAny(intake.owner_values_top3, trigger.owner_values)
    : false;
  const byPressures = trigger.pressure_sources
    ? includesAny(intake.pressure_sources_top2, trigger.pressure_sources)
    : false;
  const byRole = trigger.emyth_roles
    ? trigger.emyth_roles.includes(intake.emyth_role_split)
    : false;

  return byValues || byPressures || byRole;
}

function withVariant(moduleId: ModuleDefinition["module_id"], variant: ModuleVariant): SelectedModuleDefinition {
  return {
    ...getModuleById(moduleId),
    variant,
  };
}

export function selectModules(
  intake: SecondLookIntakeV2,
  _context?: SelectModulesContext
): SelectedModuleDefinition[] {
  const selected: SelectedModuleDefinition[] = [];
  const added = new Set<string>();

  const riskStabilizationDominant =
    intake.owner_values_top3.includes("safety_compliance") ||
    intake.pressure_sources_top2.includes("compliance_risk");

  const add = (moduleId: ModuleDefinition["module_id"], variant: ModuleVariant = "full") => {
    if (added.has(moduleId) || selected.length >= 6) return;
    selected.push(withVariant(moduleId, variant));
    added.add(moduleId);
  };

  for (const alwaysModuleId of ALWAYS_MODULE_IDS) {
    add(alwaysModuleId, "full");
  }

  add("blue_ocean_errc", riskStabilizationDominant ? "compressed" : "full");

  for (const candidateId of CONDITIONAL_MODULE_PRIORITY) {
    if (selected.length >= 6) break;
    if (!moduleTriggered(candidateId, intake)) continue;
    add(candidateId, "full");
  }

  return selected.slice(0, 6);
}
