import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { OperatingArchetype, OperatingArchetypeId } from "./types";

export type WatchListItem = {
  topic: string;
  why: string;
  what_to_watch: string;
};

export type ArchetypeWatchList = {
  time_horizon: "30-90 days";
  disclaimer: string;
  items: WatchListItem[];
  archetype_source: "detected_archetypes";
};

/**
 * Generate archetype-based watch list (not industry-specific)
 * Returns 2-4 items aligned with primary archetype and snapshot signals
 */
export function getArchetypeWatchList(
  archetypes: OperatingArchetype[],
  snapshot: SnapshotV2
): ArchetypeWatchList {
  if (archetypes.length === 0) {
    return {
      time_horizon: "30-90 days",
      disclaimer: "Watch list, not a forecast.",
      archetype_source: "detected_archetypes",
      items: [],
    };
  }

  // Find primary archetype (highest confidence)
  const primary = archetypes.reduce((best, current) => {
    const confMap = { high: 3, medium: 2, low: 1 };
    return confMap[current.confidence] > confMap[best.confidence] ? current : best;
  }, archetypes[0]);

  const items: WatchListItem[] = [];
  const maxItems = 4;

  // Get archetype-specific items
  const archetypeItems = getItemsForArchetype(primary.id, snapshot);
  items.push(...archetypeItems.slice(0, maxItems));

  // If we have secondary archetypes, add 1 cross-cutting item
  if (archetypes.length > 1 && items.length < maxItems) {
    const secondary = archetypes.find((a) => a.id !== primary.id);
    if (secondary) {
      const secondaryItems = getItemsForArchetype(secondary.id, snapshot);
      if (secondaryItems.length > 0) {
        items.push(secondaryItems[0]);
      }
    }
  }

  return {
    time_horizon: "30-90 days",
    disclaimer: "Watch list, not a forecast.",
    archetype_source: "detected_archetypes",
    items: items.slice(0, maxItems),
  };
}

function getItemsForArchetype(id: OperatingArchetypeId, snapshot: SnapshotV2): WatchListItem[] {
  switch (id) {
    case "quote_to_job":
      return getQuoteToJobItems(snapshot);
    case "ticket_driven":
      return getTicketDrivenItems(snapshot);
    case "inventory_sensitive":
      return getInventorySensitiveItems(snapshot);
    case "project_heavy":
      return getProjectHeavyItems(snapshot);
    case "seasonal_spike_driven":
      return getSeasonalSpikeItems(snapshot);
    case "repeat_relationship":
      return getRepeatRelationshipItems(snapshot);
    default:
      return [];
  }
}

function getQuoteToJobItems(snapshot: SnapshotV2): WatchListItem[] {
  const items: WatchListItem[] = [];
  const decisionLagBand = snapshot.activity_signals.quotes.decision_lag_band;

  if (decisionLagBand === "high" || decisionLagBand === "very_high") {
    items.push({
      topic: "Decision timing shifts",
      why: "Extended approval cycles affect pipeline velocity",
      what_to_watch: "Quote-to-approval lag, customer response times",
    });
  }

  items.push({
    topic: "Follow-up drift",
    why: "Quotes without follow-up become cold leads",
    what_to_watch: "Pending quote age, conversion rate changes",
  });

  items.push({
    topic: "Estimate-to-job conversion friction",
    why: "Price sensitivity or scope creep delays closes",
    what_to_watch: "Quote acceptance rate, revision frequency",
  });

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getTicketDrivenItems(_snapshot: SnapshotV2): WatchListItem[] {
  const items: WatchListItem[] = [];

  items.push({
    topic: "Schedule compression",
    why: "High volume can overload dispatch capacity",
    what_to_watch: "Booking lead time, same-day vs scheduled ratio",
  });

  items.push({
    topic: "Dispatch overload",
    why: "Too many concurrent jobs reduces close rate",
    what_to_watch: "Jobs per day trend, incomplete visits",
  });

  items.push({
    topic: "Same-day close pressure",
    why: "Callback rate increases when first visit doesn't close",
    what_to_watch: "Return trip frequency, average ticket completion time",
  });

  return items;
}

function getInventorySensitiveItems(_snapshot: SnapshotV2): WatchListItem[] {
  const items: WatchListItem[] = [];

  items.push({
    topic: "Input cost volatility",
    why: "Material or wholesale price swings affect margins without menu adjustments",
    what_to_watch: "Supplier invoice trends, price change notifications",
  });

  items.push({
    topic: "Supplier lead times",
    why: "Longer waits on inputs delay job completion",
    what_to_watch: "Order-to-delivery lag, backorder frequency",
  });

  items.push({
    topic: "Price adjustment lag",
    why: "Cost increases hit margins if pricing doesn't follow",
    what_to_watch: "Quote pricing vs recent input costs, margin compression signals",
  });

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getProjectHeavyItems(_snapshot: SnapshotV2): WatchListItem[] {
  const items: WatchListItem[] = [];

  items.push({
    topic: "Pipeline gaps",
    why: "Few large projects mean one cancellation creates revenue drop",
    what_to_watch: "Pending quote count, signed but not started backlog",
  });

  items.push({
    topic: "Cash timing on large jobs",
    why: "Milestone payments spread over months affect liquidity",
    what_to_watch: "Invoice aging on active projects, deposit collection timing",
  });

  items.push({
    topic: "Large-job decision stalls",
    why: "High-value estimates take longer and can unexpectedly drop",
    what_to_watch: "Quote age distribution, customer hesitation signals",
  });

  return items;
}

function getSeasonalSpikeItems(snapshot: SnapshotV2): WatchListItem[] {
  const items: WatchListItem[] = [];
  const phase = snapshot.season.phase;

  if (phase === "Peak" || phase === "Active") {
    items.push({
      topic: "Seasonal demand surge",
      why: "High season creates capacity constraints and cash influx",
      what_to_watch: "Booking wait time, cash position vs typical peak timing",
    });

    items.push({
      topic: "Capacity bottlenecks",
      why: "Cannot serve all demand during peak without adding resources",
      what_to_watch: "Turn-away rate, customer wait times, overtime costs",
    });
  } else {
    items.push({
      topic: "Off-season revenue shift",
      why: "Activity drops require different service mix or cost management",
      what_to_watch: "Week-to-week volume trends, fixed cost coverage",
    });
  }

  items.push({
    topic: "Backlog spillover",
    why: "Peak season jobs often finish after demand drops",
    what_to_watch: "Work-in-progress aging, completion rate vs booking rate",
  });

  return items;
}

function getRepeatRelationshipItems(_snapshot: SnapshotV2): WatchListItem[] {
  // Future: if snapshot includes repeat customer signals
  const items: WatchListItem[] = [];

  items.push({
    topic: "Renewal timing",
    why: "Service contract or membership renewals cluster in certain periods",
    what_to_watch: "Upcoming renewal dates, renewal rate trends",
  });

  items.push({
    topic: "Churn risk signals",
    why: "Customers dropping off reduce baseline revenue",
    what_to_watch: "Service frequency decline, payment issues",
  });

  return items;
}
