/**
 * Resolve pressure translation with industry overrides and group defaults.
 */

import type { IndustryGroup, IndustryKey } from "../intelligence/industry_groups";
import { getIndustryGroup, resolveIndustryKey } from "../intelligence/industry_groups";
import { normalizePressureKey } from "../pressures/pressure_translation";
import {
  GROUP_TRANSLATIONS,
  type PressureKey,
  type PressureTranslation,
} from "./pressure_translations";
import { INDUSTRY_OVERRIDES } from "./pressure_translations_overrides";

export type ResolvedPressureTranslation = PressureTranslation & {
  fallback_used: boolean;
};

const FALLBACK_TRANSLATION: PressureTranslation = {
  owner_felt_line: "Something needs attention.",
  explanation: "Patterns detected in the data suggest this area warrants review.",
  recommended_move: "Review the data and identify the next step based on your operational knowledge.",
  boundary: "Do not act if this conflicts with your direct operational knowledge.",
};

export function resolvePressureTranslation(params: {
  pressure_key: PressureKey | string;
  industry_key?: IndustryKey | string | null;
  industry_group?: IndustryGroup | null;
  cohort_label?: string;
}): ResolvedPressureTranslation {
  const canonicalKey = normalizePressureKey(params.pressure_key);
  const canonicalIndustry = resolveIndustryKey(params.industry_key ?? null);

  const group = params.industry_group ?? getIndustryGroup(canonicalIndustry ?? params.industry_key ?? null);
  const groupTranslation = GROUP_TRANSLATIONS[group]?.[canonicalKey];

  const override = canonicalIndustry ? INDUSTRY_OVERRIDES[canonicalIndustry]?.[canonicalKey] : undefined;

  const base = groupTranslation ?? FALLBACK_TRANSLATION;
  const resolved: PressureTranslation = {
    ...base,
    ...(override ?? {}),
  };

  return {
    ...resolved,
    fallback_used: !groupTranslation,
  };
}
