/**
 * Core data generator - creates realistic datasets from industry templates
 */

import { SeededRNG } from "../utils/seeded_rng";
import { getIndustryTemplate } from "../industries";
import type {
  GenerationOptions,
  GeneratedDataset,
  Customer,
  Quote,
  Job,
  Invoice,
  InvoiceItem,
  CalendarEvent,
  ScenarioFlags,
} from "../types";

export async function generateDataset(options: GenerationOptions): Promise<GeneratedDataset> {
  const rng = new SeededRNG(options.seed);
  const template = getIndustryTemplate(options.industry);
  
  // Determine scenario from seed if not provided
  const scenario = options.scenario ?? inferScenarioFromSeed(rng);
  
  // Calculate date range
  const startMs = options.startDate.getTime();
  const endMs = options.endDate.getTime();
  const daysTotal = Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000));
  
  // Generate base customer pool
  const customerCount = rng.int(15, 45);
  const customers: Customer[] = [];
  for (let i = 0; i < customerCount; i++) {
    customers.push(generateCustomer(i + 1, rng, template));
  }
  
  // Apply scenario adjustments
  const revenueDistribution = scenario.top_heavy ? "pareto" : "normal";
  const customerWeights = calculateCustomerWeights(customers.length, revenueDistribution, rng);
  
  // Generate quotes over time period
  const quotes: Quote[] = [];
  const jobs: Job[] = [];
  const invoices: Invoice[] = [];
  const invoice_items: InvoiceItem[] = [];
  const calendar_events: CalendarEvent[] = [];
  
  let quoteCounter = 1001;
  let jobCounter = 5001;
  let invoiceCounter = 8001;
  let eventCounter = 10001;
  
  // Determine close rate
  let closeRate = template.quoteCloseRate;
  if (scenario.high_approval) closeRate = Math.min(0.90, closeRate + 0.15);
  if (scenario.low_approval) closeRate = Math.max(0.35, closeRate - 0.25);
  
  // Determine payment delay
  let paymentP50 = template.paymentDelayDays.p50;
  let paymentP90 = template.paymentDelayDays.p90;
  if (scenario.slow_pay) {
    paymentP50 *= 2;
    paymentP90 *= 2.5;
  }
  if (scenario.fast_pay) {
    paymentP50 = Math.max(1, paymentP50 / 2);
    paymentP90 = Math.max(3, paymentP90 / 2);
  }
  
  // Generate quotes day by day
  for (let day = 0; day < daysTotal; day++) {
    const currentDate = new Date(startMs + day * 24 * 60 * 60 * 1000);
    const month = currentDate.getMonth();
    const seasonalMultiplier = template.seasonalMultiplierByMonth[month];
    
    // Apply seasonal scenario
    let adjustedMultiplier = seasonalMultiplier;
    if (scenario.seasonal_peak) adjustedMultiplier *= 1.5;
    if (scenario.seasonal_low) adjustedMultiplier *= 0.5;
    
    // Base quotes per day varies by industry
    const baseQuotesPerDay = template.key === "landscaping" || template.key === "cleaning" ? 2 : 1;
    const expectedQuotes = baseQuotesPerDay * adjustedMultiplier;
    
    // Poisson-like distribution for quote arrivals
    const quotesToday = rng.chance(expectedQuotes) ? rng.int(1, Math.ceil(expectedQuotes * 1.5)) : 0;
    
    for (let q = 0; q < quotesToday; q++) {
      // Pick customer (weighted)
      const customerIdx = rng.weightedPick(
        customers.map((_, i) => i),
        customerWeights
      );
      const customer = customers[customerIdx];
      
      // Pick job type based on season
      const season = getSeason(month);
      const jobType = pickJobType(template.jobTypes, season, rng);
      
      // Generate quote
      const quoteAmount = rng.percentile(jobType.ticketRange);
      const quoteId = `Q-${quoteCounter++}`;
      const createdAt = addBusinessHours(currentDate, rng.int(8, 17), rng);
      
      let status: Quote["status"] = "Sent";
      let approvedAt: string | undefined;
      
      // Determine if quote gets approved
      if (rng.chance(closeRate)) {
        status = "Approved";
        const lagDays = rng.chance(0.5) 
          ? rng.int(0, template.followUpLagDays.p50)
          : rng.int(template.followUpLagDays.p50, template.followUpLagDays.p90);
        approvedAt = addDays(createdAt, lagDays);
      } else if (rng.chance(0.15)) {
        status = "Rejected";
      }
      
      quotes.push({
        id: quoteId,
        customer_id: customer.id,
        created_at: createdAt,
        job_type: jobType.name,
        amount_estimate: Math.round(quoteAmount * 100) / 100,
        status,
        approved_at: approvedAt,
      });
      
      // If approved, generate job + invoice
      if (status === "Approved" && approvedAt) {
        const jobId = `J-${jobCounter++}`;
        const scheduledStart = addDays(approvedAt, rng.int(2, 14));
        const durationHours = rng.float(jobType.typicalDurationHours[0], jobType.typicalDurationHours[1]);
        const scheduledEnd = addHours(scheduledStart, durationHours);
        const tech = rng.pick(template.techNames);
        
        const jobStatus: Job["status"] = "Completed";
        const completedAt = addHours(scheduledEnd, rng.float(-0.5, 0.5));
        
        jobs.push({
          id: jobId,
          quote_id: quoteId,
          status: jobStatus,
          tech,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          completed_at: completedAt,
        });
        
        // Add calendar event
        calendar_events.push({
          id: `E-${eventCounter++}`,
          tech,
          start: scheduledStart,
          end: scheduledEnd,
          title: `${jobType.name} - ${customer.name}`,
          job_id: jobId,
        });
        
        // Generate invoice
        const invoiceId = `INV-${invoiceCounter++}`;
        const issuedAt = addDays(completedAt, rng.int(0, 3));
        const dueAt = addDays(issuedAt, 30);
        
        // Calculate actual invoice amount (may vary from quote)
        const invoiceSubtotal = quoteAmount * rng.float(0.95, 1.10);
        const taxRate = 0.08;
        const tax = invoiceSubtotal * taxRate;
        const total = invoiceSubtotal + tax;
        
        let invoiceStatus: Invoice["status"] = "Open";
        let paidAt: string | undefined;
        
        // Determine payment
        if (rng.chance(0.85)) {
          const paymentLag = rng.chance(0.5)
            ? rng.int(1, paymentP50)
            : rng.int(paymentP50, paymentP90);
          paidAt = addDays(issuedAt, paymentLag);
          
          // Check if overdue before payment
          const overdueDate = addDays(dueAt, 7);
          if (paidAt > overdueDate) {
            invoiceStatus = "Overdue";
            // Still mark as paid eventually
            if (rng.chance(0.90)) {
              invoiceStatus = "Paid";
            }
          } else {
            invoiceStatus = "Paid";
          }
        } else {
          // Unpaid
          if (new Date(dueAt) < new Date()) {
            invoiceStatus = "Overdue";
          }
        }
        
        invoices.push({
          id: invoiceId,
          job_id: jobId,
          quote_id: quoteId,
          issued_at: issuedAt,
          due_at: dueAt,
          subtotal: Math.round(invoiceSubtotal * 100) / 100,
          tax: Math.round(tax * 100) / 100,
          total: Math.round(total * 100) / 100,
          status: invoiceStatus,
          paid_at: paidAt,
        });
        
        // Generate invoice line items
        const laborHours = durationHours;
        const laborCost = laborHours * template.defaultLaborRate;
        invoice_items.push({
          invoice_id: invoiceId,
          name: `Labor - ${jobType.name}`,
          qty: Math.round(laborHours * 100) / 100,
          unit_price: template.defaultLaborRate,
          line_total: Math.round(laborCost * 100) / 100,
        });
        
        // Add materials
        const numMaterials = rng.int(1, Math.min(3, jobType.materialsPool.length));
        for (let m = 0; m < numMaterials; m++) {
          const material = rng.pick(jobType.materialsPool);
          const qty = material.qtyRange ? rng.int(material.qtyRange[0], material.qtyRange[1]) : 1;
          invoice_items.push({
            invoice_id: invoiceId,
            name: material.name,
            qty,
            unit_price: material.sellPrice,
            line_total: Math.round(qty * material.sellPrice * 100) / 100,
          });
        }
      }
    }
  }
  
  // Add some out-of-window rows for testing exclusions (5-10 before startDate)
  const outOfWindowCount = rng.int(5, 10);
  for (let i = 0; i < outOfWindowCount; i++) {
    const daysBeforeStart = rng.int(91, 180);
    const earlyDate = new Date(startMs - daysBeforeStart * 24 * 60 * 60 * 1000);
    const customer = rng.pick(customers);
    const jobType = rng.pick(template.jobTypes);
    const quoteAmount = rng.percentile(jobType.ticketRange);
    
    quotes.push({
      id: `Q-${quoteCounter++}`,
      customer_id: customer.id,
      created_at: earlyDate.toISOString(),
      job_type: jobType.name,
      amount_estimate: Math.round(quoteAmount * 100) / 100,
      status: "Approved",
      approved_at: addDays(earlyDate.toISOString(), rng.int(1, 5)),
    });
  }
  
  return {
    customers,
    quotes,
    jobs,
    invoices,
    invoice_items,
    calendar_events,
  };
}

function generateCustomer(id: number, rng: SeededRNG, template: any): Customer {
  const firstNames = ["John", "Mary", "Robert", "Patricia", "Michael", "Linda", "William", "Barbara", 
    "David", "Elizabeth", "Richard", "Jennifer", "Joseph", "Maria", "Thomas", "Susan"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor"];
  
  const firstName = rng.pick(firstNames);
  const lastName = rng.pick(lastNames);
  const name = `${firstName} ${lastName}`;
  
  const address = `${rng.int(100, 9999)} ${rng.pick(["Main", "Oak", "Maple", "Elm", "Pine"])} ${rng.pick(["St", "Ave", "Dr", "Ln"])}`;
  const phone = `${rng.int(200, 999)}-${rng.int(200, 999)}-${rng.int(1000, 9999)}`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
  
  return {
    id: `C-${id.toString().padStart(4, "0")}`,
    name,
    address,
    phone,
    email,
  };
}

function inferScenarioFromSeed(rng: SeededRNG): ScenarioFlags {
  const r = rng.int(1, 10);
  if (r <= 2) return { top_heavy: true, slow_pay: true };
  if (r <= 4) return { distributed: true, fast_pay: true, high_approval: true };
  if (r <= 6) return { low_approval: true };
  if (r <= 8) return { seasonal_peak: true };
  return { seasonal_low: true };
}

function calculateCustomerWeights(count: number, distribution: "pareto" | "normal", rng: SeededRNG): number[] {
  if (distribution === "pareto") {
    // Top 20% get 80% of weight
    const weights: number[] = [];
    const topCount = Math.ceil(count * 0.2);
    for (let i = 0; i < count; i++) {
      if (i < topCount) {
        weights.push(4); // 4x weight for top 20%
      } else {
        weights.push(1);
      }
    }
    // Don't shuffle - keep top customers at the front for consistent concentration
    return weights;
  }
  // Normal distribution
  return Array(count).fill(1);
}

function getSeason(month: number): "summer" | "winter" | "shoulder" {
  if (month >= 5 && month <= 8) return "summer";
  if (month >= 11 || month <= 1) return "winter";
  return "shoulder";
}

function pickJobType(jobTypes: any[], season: string, rng: SeededRNG): any {
  const weights = jobTypes.map((jt) => jt.baseWeightBySeason[season]);
  return rng.weightedPick(jobTypes, weights);
}

function addBusinessHours(date: Date | string, hour: number, rng: SeededRNG): string {
  const d = new Date(date);
  d.setHours(hour, rng.int(0, 59), 0, 0);
  return d.toISOString();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function addHours(dateStr: string, hours: number): string {
  const d = new Date(dateStr);
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}
