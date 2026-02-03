import { IndustryTemplate } from "../types";

/**
 * Landscaping industry template
 * Strong spring/summer peak
 * High recurring maintenance, seasonal cleanups
 */
export const landscapingTemplate: IndustryTemplate = {
  key: "landscaping",
  displayName: "Landscaping & Lawn Care",
  defaultLaborRate: 65,
  techNames: ["Juan M.", "Tim C.", "Lisa P.", "Marcus T.", "Kelly D.", "Steve B."],
  serviceAreas: [
    "Sacramento, CA",
    "Orlando, FL",
    "Houston, TX",
    "Phoenix, AZ",
    "San Antonio, TX",
    "Jacksonville, FL",
  ],
  // Strong spring/summer peak
  seasonalMultiplierByMonth: {
    0: 0.5, // Jan - low
    1: 0.6, // Feb - low
    2: 0.9, // Mar - starting
    3: 1.3, // Apr - spring peak
    4: 1.5, // May - peak
    5: 1.6, // Jun - peak
    6: 1.5, // Jul - peak
    7: 1.4, // Aug - high
    8: 1.2, // Sep
    9: 1.0, // Oct - fall cleanup
    10: 0.7, // Nov
    11: 0.6, // Dec - low
  },
  jobTypes: [
    {
      name: "Weekly Mowing",
      baseWeightBySeason: { summer: 50, winter: 5, shoulder: 35 },
      typicalDurationHours: [0.5, 1.5],
      ticketRange: { p25: 35, p50: 55, p75: 85, p90: 120 },
      materialsPool: [
        { name: "Fuel/Equipment Use", unitCost: 3, sellPrice: 10, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Spring Cleanup",
      baseWeightBySeason: { summer: 5, winter: 0, shoulder: 30 },
      typicalDurationHours: [3, 6],
      ticketRange: { p25: 250, p50: 400, p75: 650, p90: 950 },
      materialsPool: [
        { name: "Mulch (cubic yard)", unitCost: 25, sellPrice: 65, qtyRange: [3, 8] },
        { name: "Fertilizer", unitCost: 30, sellPrice: 75, qtyRange: [1, 3] },
      ],
    },
    {
      name: "Fall Cleanup",
      baseWeightBySeason: { summer: 0, winter: 5, shoulder: 25 },
      typicalDurationHours: [3, 6],
      ticketRange: { p25: 200, p50: 350, p75: 550, p90: 800 },
      materialsPool: [
        { name: "Leaf Removal", unitCost: 10, sellPrice: 30, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Irrigation Repair",
      baseWeightBySeason: { summer: 20, winter: 5, shoulder: 15 },
      typicalDurationHours: [2, 4],
      ticketRange: { p25: 180, p50: 320, p75: 550, p90: 850 },
      materialsPool: [
        { name: "Sprinkler Heads", unitCost: 5, sellPrice: 18, qtyRange: [2, 8] },
        { name: "Valves", unitCost: 15, sellPrice: 45, qtyRange: [1, 3] },
        { name: "PVC Fittings", unitCost: 3, sellPrice: 12, qtyRange: [3, 10] },
      ],
    },
    {
      name: "Tree/Shrub Trimming",
      baseWeightBySeason: { summer: 15, winter: 10, shoulder: 20 },
      typicalDurationHours: [2, 5],
      ticketRange: { p25: 200, p50: 380, p75: 650, p90: 1000 },
      materialsPool: [
        { name: "Disposal Fee", unitCost: 25, sellPrice: 75, qtyRange: [1, 2] },
      ],
    },
    {
      name: "Planting/Installation",
      baseWeightBySeason: { summer: 10, winter: 5, shoulder: 10 },
      typicalDurationHours: [3, 6],
      ticketRange: { p25: 400, p50: 750, p75: 1200, p90: 2000 },
      materialsPool: [
        { name: "Plants/Shrubs", unitCost: 25, sellPrice: 65, qtyRange: [5, 15] },
        { name: "Soil/Amendments", unitCost: 15, sellPrice: 40, qtyRange: [3, 8] },
        { name: "Mulch", unitCost: 25, sellPrice: 65, qtyRange: [2, 5] },
      ],
    },
  ],
  paymentDelayDays: { p50: 7, p90: 21 }, // Faster payments (residential)
  quoteCloseRate: 0.75, // High close rate for recurring services
  followUpLagDays: { p50: 2, p90: 8 },
  revisitRate: 0.65, // Very high - weekly recurring
};
