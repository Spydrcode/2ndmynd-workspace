export { hvacTemplate } from "./hvac";
export { plumbingTemplate } from "./plumbing";
export { electricalTemplate } from "./electrical";
export { landscapingTemplate } from "./landscaping";
export { cleaningTemplate } from "./cleaning";

import { hvacTemplate } from "./hvac";
import { plumbingTemplate } from "./plumbing";
import { electricalTemplate } from "./electrical";
import { landscapingTemplate } from "./landscaping";
import { cleaningTemplate } from "./cleaning";
import { IndustryKey, IndustryTemplate } from "../types";

export const INDUSTRY_TEMPLATES: Record<IndustryKey, IndustryTemplate> = {
  hvac: hvacTemplate,
  plumbing: plumbingTemplate,
  electrical: electricalTemplate,
  landscaping: landscapingTemplate,
  cleaning: cleaningTemplate,
};

export function getIndustryTemplate(key: IndustryKey): IndustryTemplate {
  const template = INDUSTRY_TEMPLATES[key];
  if (!template) {
    throw new Error(`Unknown industry: ${key}`);
  }
  return template;
}
