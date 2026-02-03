import { IndustryTemplate } from "../types";

/**
 * Cleaning industry template
 * Steady year-round with recurring services
 * Fast turnaround, high revisit rate
 */
export const cleaningTemplate: IndustryTemplate = {
  key: "cleaning",
  displayName: "Professional Cleaning Services",
  defaultLaborRate: 45,
  techNames: ["Maria G.", "James W.", "Nicole B.", "Alex R.", "Carmen S.", "David L."],
  serviceAreas: [
    "Los Angeles, CA",
    "New York, NY",
    "Miami, FL",
    "Chicago, IL",
    "Seattle, WA",
    "Washington, DC",
  ],
  // Steady year-round, slight spring/fall increase (move-outs)
  seasonalMultiplierByMonth: {
    0: 1.0,
    1: 1.0,
    2: 1.0,
    3: 1.1, // Spring move-outs
    4: 1.2,
    5: 1.1,
    6: 1.0,
    7: 1.0,
    8: 1.2, // Fall move-outs
    9: 1.1,
    10: 1.0,
    11: 1.0,
  },
  jobTypes: [
    {
      name: "Recurring Clean (Bi-weekly)",
      baseWeightBySeason: { summer: 50, winter: 50, shoulder: 50 },
      typicalDurationHours: [2, 4],
      ticketRange: { p25: 120, p50: 180, p75: 260, p90: 350 },
      materialsPool: [
        { name: "Cleaning Supplies", unitCost: 10, sellPrice: 25, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Deep Clean",
      baseWeightBySeason: { summer: 20, winter: 20, shoulder: 20 },
      typicalDurationHours: [4, 6],
      ticketRange: { p25: 250, p50: 380, p75: 550, p90: 750 },
      materialsPool: [
        { name: "Premium Cleaning Kit", unitCost: 18, sellPrice: 45, qtyRange: [1, 1] },
        { name: "Specialty Products", unitCost: 12, sellPrice: 35, qtyRange: [1, 2] },
      ],
    },
    {
      name: "Move-Out Clean",
      baseWeightBySeason: { summer: 15, winter: 10, shoulder: 18 },
      typicalDurationHours: [4, 8],
      ticketRange: { p25: 300, p50: 450, p75: 650, p90: 900 },
      materialsPool: [
        { name: "Deep Clean Supplies", unitCost: 20, sellPrice: 50, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Carpet Cleaning",
      baseWeightBySeason: { summer: 10, winter: 15, shoulder: 10 },
      typicalDurationHours: [2, 4],
      ticketRange: { p25: 150, p50: 250, p75: 400, p90: 600 },
      materialsPool: [
        { name: "Carpet Cleaning Solution", unitCost: 15, sellPrice: 40, qtyRange: [1, 2] },
      ],
    },
    {
      name: "Window Cleaning",
      baseWeightBySeason: { summer: 5, winter: 5, shoulder: 5 },
      typicalDurationHours: [2, 3],
      ticketRange: { p25: 120, p50: 180, p75: 280, p90: 400 },
      materialsPool: [
        { name: "Window Cleaning Supplies", unitCost: 8, sellPrice: 20, qtyRange: [1, 1] },
      ],
    },
  ],
  paymentDelayDays: { p50: 5, p90: 18 }, // Very fast (often paid same day)
  quoteCloseRate: 0.78, // High for recurring services
  followUpLagDays: { p50: 1, p90: 5 }, // Fast response
  revisitRate: 0.80, // Very high - bi-weekly recurring
};
