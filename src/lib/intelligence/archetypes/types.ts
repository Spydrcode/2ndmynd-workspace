/**
 * Operating Archetypes — Industry-agnostic business patterns
 * Detected from snapshot_v2 signals only
 */

export type OperatingArchetypeId =
  | "quote_to_job"
  | "ticket_driven"
  | "inventory_sensitive"
  | "project_heavy"
  | "seasonal_spike_driven"
  | "repeat_relationship";

export type ConfidenceBand = "high" | "medium" | "low";

export type OperatingArchetype = {
  id: OperatingArchetypeId;
  label: string;
  confidence: ConfidenceBand;
  evidence: string[];
};

export type ArchetypeDetectionResult = {
  archetypes: OperatingArchetype[];
  primary?: OperatingArchetypeId;
  notes?: string[];
};

// Re-export watch list types from pressures for convenience
export type { ArchetypeWatchList, WatchListItem } from "./pressures";
