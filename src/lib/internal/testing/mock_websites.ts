import type { IndustryKey } from "../../../../packages/mockgen/src/types";

export const CURATED_WEBSITES: Record<IndustryKey, string[]> = {
  hvac: ["https://www.carrier.com", "https://www.lennox.com"],
  plumbing: ["https://www.rotorooter.com", "https://www.mrrooter.com"],
  electrical: ["https://www.mrelectric.com", "https://www.acelectric.com"],
  landscaping: ["https://www.brightview.com", "https://www.trugreen.com"],
  cleaning: ["https://www.merrymaids.com", "https://www.thecleaningauthority.com"],
};

export function pickCuratedWebsite(industry: IndustryKey, seed?: number) {
  const list = CURATED_WEBSITES[industry] ?? [];
  if (!list.length) return null;
  const idx = typeof seed === "number" ? Math.abs(seed) % list.length : 0;
  return list[idx];
}
