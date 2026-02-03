import { IndustryTemplate } from "../types";

/**
 * Plumbing industry template
 * Seasonal: winter freeze issues, summer steady
 * Emergency-heavy with quick response
 */
export const plumbingTemplate: IndustryTemplate = {
  key: "plumbing",
  displayName: "Plumbing Services",
  defaultLaborRate: 110,
  techNames: ["Joe M.", "Linda T.", "Frank B.", "Amy S.", "Rob H.", "Nina G."],
  serviceAreas: [
    "Seattle, WA",
    "Portland, OR",
    "Denver, CO",
    "Chicago, IL",
    "Boston, MA",
    "Minneapolis, MN",
  ],
  // Winter peak (freeze issues), steady otherwise
  seasonalMultiplierByMonth: {
    0: 1.3, // Jan - freeze issues
    1: 1.4, // Feb - freeze issues
    2: 1.2, // Mar
    3: 1.0,
    4: 1.0,
    5: 1.0,
    6: 1.0,
    7: 1.0,
    8: 1.0,
    9: 1.0,
    10: 1.1,
    11: 1.2, // Dec - pre-freeze prep
  },
  jobTypes: [
    {
      name: "Leak Repair",
      baseWeightBySeason: { summer: 30, winter: 35, shoulder: 32 },
      typicalDurationHours: [1, 3],
      ticketRange: { p25: 180, p50: 320, p75: 550, p90: 850 },
      materialsPool: [
        { name: "Pipe Fittings", unitCost: 8, sellPrice: 25, qtyRange: [2, 6] },
        { name: "Solder/Flux", unitCost: 5, sellPrice: 18, qtyRange: [1, 2] },
        { name: "Shut-off Valve", unitCost: 15, sellPrice: 45, qtyRange: [1, 2] },
      ],
    },
    {
      name: "Water Heater Repair",
      baseWeightBySeason: { summer: 20, winter: 25, shoulder: 22 },
      typicalDurationHours: [2, 4],
      ticketRange: { p25: 250, p50: 450, p75: 750, p90: 1100 },
      materialsPool: [
        { name: "Heating Element", unitCost: 25, sellPrice: 75, qtyRange: [1, 2] },
        { name: "Thermostat (WH)", unitCost: 20, sellPrice: 60, qtyRange: [1, 2] },
        { name: "Anode Rod", unitCost: 18, sellPrice: 55, qtyRange: [1, 1] },
        { name: "Relief Valve", unitCost: 22, sellPrice: 70, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Water Heater Install",
      baseWeightBySeason: { summer: 15, winter: 15, shoulder: 15 },
      typicalDurationHours: [4, 6],
      ticketRange: { p25: 1200, p50: 1800, p75: 2500, p90: 3500 },
      materialsPool: [
        { name: "Water Heater (50gal)", unitCost: 550, sellPrice: 1200, qtyRange: [1, 1] },
        { name: "Installation Kit", unitCost: 45, sellPrice: 150, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Drain Cleaning",
      baseWeightBySeason: { summer: 20, winter: 15, shoulder: 18 },
      typicalDurationHours: [1, 2],
      ticketRange: { p25: 150, p50: 250, p75: 400, p90: 650 },
      materialsPool: [
        { name: "Drain Snake Cable", unitCost: 12, sellPrice: 40, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Fixture Installation",
      baseWeightBySeason: { summer: 10, winter: 5, shoulder: 8 },
      typicalDurationHours: [2, 4],
      ticketRange: { p25: 300, p50: 500, p75: 850, p90: 1400 },
      materialsPool: [
        { name: "Faucet (Premium)", unitCost: 120, sellPrice: 350, qtyRange: [1, 1] },
        { name: "Supply Lines", unitCost: 8, sellPrice: 25, qtyRange: [2, 4] },
        { name: "Mounting Hardware", unitCost: 10, sellPrice: 30, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Sewer Line Service",
      baseWeightBySeason: { summer: 5, winter: 5, shoulder: 5 },
      typicalDurationHours: [3, 6],
      ticketRange: { p25: 800, p50: 1500, p75: 2500, p90: 4000 },
      materialsPool: [
        { name: "Sewer Line Materials", unitCost: 200, sellPrice: 600, qtyRange: [1, 1] },
      ],
    },
  ],
  paymentDelayDays: { p50: 10, p90: 28 },
  quoteCloseRate: 0.72, // Higher due to emergency nature
  followUpLagDays: { p50: 1, p90: 7 }, // Fast response
  revisitRate: 0.12,
};
