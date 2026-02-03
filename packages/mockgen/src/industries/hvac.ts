import { IndustryTemplate } from "../types";

/**
 * HVAC industry template
 * Peaks: summer (cooling) and winter (heating)
 * High revisit rate for maintenance contracts
 */
export const hvacTemplate: IndustryTemplate = {
  key: "hvac",
  displayName: "HVAC Service & Repair",
  defaultLaborRate: 125,
  techNames: ["Mike R.", "Sarah K.", "Tom L.", "Jessica M.", "Dan P.", "Chris W."],
  serviceAreas: [
    "Phoenix, AZ",
    "Austin, TX",
    "Charlotte, NC",
    "Dallas, TX",
    "Atlanta, GA",
    "Las Vegas, NV",
  ],
  // Summer and winter peaks
  seasonalMultiplierByMonth: {
    0: 1.2, // Jan - heating
    1: 1.3, // Feb - heating
    2: 1.1, // Mar
    3: 1.0, // Apr
    4: 1.0, // May
    5: 1.4, // Jun - cooling peak
    6: 1.6, // Jul - cooling peak
    7: 1.5, // Aug - cooling peak
    8: 1.2, // Sep
    9: 1.0, // Oct
    10: 1.0, // Nov
    11: 1.2, // Dec - heating
  },
  jobTypes: [
    {
      name: "AC Repair",
      baseWeightBySeason: { summer: 50, winter: 10, shoulder: 25 },
      typicalDurationHours: [2, 4],
      ticketRange: { p25: 250, p50: 450, p75: 750, p90: 1200 },
      materialsPool: [
        { name: "Refrigerant R-410A", unitCost: 45, sellPrice: 120, qtyRange: [1, 3] },
        { name: "Capacitor", unitCost: 12, sellPrice: 45, qtyRange: [1, 2] },
        { name: "Contactor", unitCost: 18, sellPrice: 65, qtyRange: [1, 1] },
        { name: "Thermostat", unitCost: 35, sellPrice: 95, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Furnace Repair",
      baseWeightBySeason: { summer: 5, winter: 45, shoulder: 15 },
      typicalDurationHours: [2, 3],
      ticketRange: { p25: 200, p50: 400, p75: 650, p90: 1000 },
      materialsPool: [
        { name: "Igniter", unitCost: 25, sellPrice: 85, qtyRange: [1, 1] },
        { name: "Flame Sensor", unitCost: 15, sellPrice: 55, qtyRange: [1, 1] },
        { name: "Gas Valve", unitCost: 75, sellPrice: 225, qtyRange: [1, 1] },
        { name: "Blower Motor", unitCost: 120, sellPrice: 350, qtyRange: [1, 1] },
      ],
    },
    {
      name: "System Installation",
      baseWeightBySeason: { summer: 20, winter: 20, shoulder: 25 },
      typicalDurationHours: [6, 10],
      ticketRange: { p25: 4500, p50: 6500, p75: 9000, p90: 12000 },
      materialsPool: [
        { name: "Complete HVAC System", unitCost: 2800, sellPrice: 5500, qtyRange: [1, 1] },
        { name: "Ductwork Materials", unitCost: 450, sellPrice: 1200, qtyRange: [1, 1] },
        { name: "Thermostat (Smart)", unitCost: 85, sellPrice: 250, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Maintenance Service",
      baseWeightBySeason: { summer: 15, winter: 15, shoulder: 25 },
      typicalDurationHours: [1, 2],
      ticketRange: { p25: 89, p50: 120, p75: 165, p90: 220 },
      materialsPool: [
        { name: "Filter (Premium)", unitCost: 12, sellPrice: 35, qtyRange: [1, 2] },
        { name: "Coil Cleaner", unitCost: 8, sellPrice: 25, qtyRange: [1, 1] },
      ],
    },
    {
      name: "Duct Cleaning",
      baseWeightBySeason: { summer: 10, winter: 10, shoulder: 10 },
      typicalDurationHours: [3, 5],
      ticketRange: { p25: 350, p50: 500, p75: 700, p90: 950 },
      materialsPool: [
        { name: "Duct Sealing Materials", unitCost: 40, sellPrice: 120, qtyRange: [1, 1] },
      ],
    },
  ],
  paymentDelayDays: { p50: 14, p90: 35 },
  quoteCloseRate: 0.68,
  followUpLagDays: { p50: 2, p90: 10 },
  revisitRate: 0.22, // High due to maintenance contracts
};
