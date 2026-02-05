/**
 * Industry Group Model (Re-export)
 *
 * Kept for backward compatibility. Canonical mapping lives in
 * src/lib/intelligence/industry_groups.ts
 */

export {
  getIndustryGroup,
  getIndustryGroupFromCohort,
  getIndustryLabel,
  resolveIndustryKey,
  INDUSTRY_GROUP_MAP,
  type IndustryGroup,
  type IndustryKey,
} from "../intelligence/industry_groups";

export { INDUSTRY_GROUP_MAP as INDUSTRY_TO_GROUP } from "../intelligence/industry_groups";
