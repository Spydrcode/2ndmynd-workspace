import { IndustryTemplate } from "../types";

/**
 * Electrical industry template
 * Steady year-round, some summer peak (AC electrical issues)
 * Mix of service calls and larger projects
 */
export const electricalTemplate: IndustryTemplate = {
  key: "electrical",
  displayName: "Electrical Services",
  defaultLaborRate: 115,
  techNames: ["Carlos R.", "Emily J.", "Dave K.", "Rachel N.", "Brian S.", "Maria L."],
  serviceAreas: [
    "San Diego, CA",
    "Tampa, FL",
    "Nashville, TN",
    "Raleigh, NC",
    "Indianapolis, IN",
    "Columbus, OH",
  ],
  // Relatively steady, slight summer peak
  seasonalMultiplierByMonth: {
    0: 1.0,
    1: 1.0,
    2: 1.0,
    3: 1.0,
    4: 1.1,
    5: 1.2, // Summer electrical demand
    6: 1.3,
    7: 1.2,
    8: 1.1,
    9: 1.0,
    10: 1.0,
    11: 1.0,
  },
  jobTypes: [
    {
      name: "Service Call / Troubleshooting",
      baseWeightBySeason: { summer: 35, winter: 30, shoulder: 32 },
      typicalDurationHours: [1, 2],
      ticketRange: { p25: 150, p50: 250, p75: 400, p90: 650 },
      materialsPool: [
        { name: "Circuit Breaker", unitCost: 12, sellPrice: 40, qtyRange: [1, 3] },
        { name: "Wire Connectors", unitCost: 3, sellPrice: 12, qtyRange: [5, 15] },
        { name: "Receptacle", unitCost: 4, sellPrice: 18, qtyRange: [1, 4] },
      ],
    },
    {
      name: "Panel Upgrade",
      baseWeightBySeason: { summer: 15, winter: 20, shoulder: 18 },
      typicalDurationHours: [6, 10],
      ticketRange: { p25: 1800, p50: 2800, p75: 4200, p90: 6500 },
      materialsPool: [
        { name: "Electrical Panel (200A)", unitCost: 350, sellPrice: 900, qtyRange: [1, 1] },
        { name: "Circuit Breakers (set)", unitCost: 120, sellPrice: 350, qtyRange: [1, 1] },
        { name: "Wiring/Conduit", unitCost: 150, sellPrice: 450, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Outlet/Switch Installation",
      baseWeightBySeason: { summer: 20, winter: 15, shoulder: 18 },
      typicalDurationHours: [1, 3],
      ticketRange: { p25: 120, p50: 220, p75: 380, p90: 600 },
      materialsPool: [
        { name: "Outlet (GFCI)", unitCost: 8, sellPrice: 28, qtyRange: [1, 6] },
        { name: "Switch (Dimmer)", unitCost: 12, sellPrice: 38, qtyRange: [1, 4] },
        { name: "Face Plates", unitCost: 2, sellPrice: 8, qtyRange: [2, 10] },
      ],
    },
    {
      name: "Lighting Installation",
      baseWeightBySeason: { summer: 10, winter: 10, shoulder: 10 },
      typicalDurationHours: [2, 4],
      ticketRange: { p25: 300, p50: 550, p75: 900, p90: 1500 },
      materialsPool: [
        { name: "Light Fixture", unitCost: 75, sellPrice: 220, qtyRange: [1, 4] },
        { name: "LED Bulbs", unitCost: 4, sellPrice: 15, qtyRange: [4, 12] },
        { name: "Wiring/Boxes", unitCost: 20, sellPrice: 65, qtyRange: [1, 4] },
      ],
    },
    {
      name: "EV Charger Installation",
      baseWeightBySeason: { summer: 15, winter: 20, shoulder: 17 },
      typicalDurationHours: [4, 6],
      ticketRange: { p25: 800, p50: 1200, p75: 1800, p90: 2500 },
      materialsPool: [
        { name: "EV Charger (Level 2)", unitCost: 350, sellPrice: 750, qtyRange: [1, 1] },
        { name: "Dedicated Circuit", unitCost: 120, sellPrice: 350, qtyRange: [1, 1] },
        { name: "Conduit/Wiring", unitCost: 80, sellPrice: 250, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Generator Install",
      baseWeightBySeason: { summer: 5, winter: 5, shoulder: 5 },
      typicalDurationHours: [6, 8],
      ticketRange: { p25: 3000, p50: 4500, p75: 6500, p90: 9000 },
      materialsPool: [
        { name: "Standby Generator", unitCost: 2000, sellPrice: 4000, qtyRange: [1, 1] },
        { name: "Transfer Switch", unitCost: 350, sellPrice: 850, qtyRange: [1, 1] },
        { name: "Installation Materials", unitCost: 200, sellPrice: 600, qtyRange: [1, 1] },
      ],
    },
  ],
  paymentDelayDays: { p50: 17, p90: 40 },
  quoteCloseRate: 0.62,
  followUpLagDays: { p50: 3, p90: 12 },
  revisitRate: 0.08,
};
