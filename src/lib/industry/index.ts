/**
 * Industry Voice Module - Exports
 */

export {
  INDUSTRY_VOICE_HINTS,
  getIndustryPhrase,
  pressureKeyToContext,
  getIndustryAnchor,
  type IndustryBucket,
  type IndustryVoiceHint,
} from "./industry_voice";

export {
  INDUSTRY_INDEX,
  getPriorityIndustries,
  getIndustriesNeedingBaselines,
  markBaselineReady,
  type IndustryMetadata,
  type IndustryPriority,
} from "./industry_index";

export {
  getIndustryGroup,
  getIndustryGroupFromCohort,
  INDUSTRY_TO_GROUP,
  type IndustryGroup,
} from "./industry_groups";
