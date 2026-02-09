import fs from "node:fs";
import path from "node:path";

import type { DecisionArtifactV1, StageArtifactMap, StageName } from "./contracts";

export type GuardFailure = {
  code: string;
  message: string;
  stage_name: StageName;
};

export type GuardResult = {
  passed: boolean;
  failures: GuardFailure[];
};

export type PolicyConfig = {
  forbidden_vocabulary: string[];
  infinite_feed_phrases: string[];
  shaming_phrases: string[];
  stage_drift_terms: Record<StageName, string[]>;
  max_actions_30_days: number;
};

const DEFAULT_POLICY: PolicyConfig = {
  forbidden_vocabulary: [
    "dashboard",
    "dashboards",
    "kpi",
    "kpis",
    "analytics",
    "monitoring",
    "bi",
    "performance tracking",
    "scorecard",
    "leaderboard",
  ],
  infinite_feed_phrases: [
    "check daily",
    "check weekly",
    "track this metric",
    "track over time",
    "monitor this",
  ],
  shaming_phrases: [
    "your fault",
    "you failed",
    "you should have",
    "you are bad at",
    "owner failure",
    "you did not do enough",
  ],
  stage_drift_terms: {
    quant_signals: ["should", "need to", "strategy", "hire", "price"],
    emyth_owner_load: ["software", "tool", "hire", "scale", "marketing funnel"],
    competitive_lens: ["dashboard", "kpi", "track", "instrument", "monitor"],
    blue_ocean: ["hire", "expand territory", "new office", "daily tracking"],
    synthesis_decision: ["dashboard", "kpi", "monitor", "scorecard"],
  },
  max_actions_30_days: 9,
};

let cachedPolicy: PolicyConfig | null = null;

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
    return out;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStrings(entry, out);
    }
  }

  return out;
}

function scanTerms(strings: string[], terms: string[]): string[] {
  const found = new Set<string>();

  for (const rawTerm of terms) {
    const term = normalizeToken(rawTerm);
    if (!term) continue;

    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = term.includes(" ")
      ? new RegExp(escaped, "i")
      : new RegExp(`\\b${escaped}\\b`, "i");

    if (strings.some((line) => pattern.test(line))) {
      found.add(term);
    }
  }

  return [...found];
}

function scanForRawDataLeak(strings: string[]): string[] {
  const failures: string[] = [];
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phonePattern = /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;
  const addressHintPattern = /\b(street|st\.|avenue|ave\.|road|rd\.|suite|apt\.)\b/i;

  for (const line of strings) {
    if (emailPattern.test(line)) failures.push("possible_email_exposure");
    if (phonePattern.test(line)) failures.push("possible_phone_exposure");
    if (addressHintPattern.test(line)) failures.push("possible_address_exposure");
  }

  return [...new Set(failures)];
}

function validateEvidenceRefs(stageName: StageName, payload: unknown): string[] {
  const refs: string[] = [];
  const gather = (value: unknown) => {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      for (const item of value) gather(item);
      return;
    }

    const record = value as Record<string, unknown>;
    if (Array.isArray(record.evidence_refs)) {
      for (const ref of record.evidence_refs) {
        if (typeof ref === "string") refs.push(ref);
      }
    }

    for (const child of Object.values(record)) {
      gather(child);
    }
  };

  gather(payload);

  const invalid = refs.filter((ref) => !/^bucket:[a-z0-9_:-]+$/.test(ref));
  return invalid.map((ref) => `${stageName}: invalid evidence_ref ${ref}`);
}

export function loadPolicyConfig(): PolicyConfig {
  if (cachedPolicy) {
    return cachedPolicy;
  }

  const policyPath = path.resolve(process.cwd(), "config", "intelligence_v4.policy.json");
  if (!fs.existsSync(policyPath)) {
    cachedPolicy = DEFAULT_POLICY;
    return cachedPolicy;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8")) as Partial<PolicyConfig>;
    cachedPolicy = {
      forbidden_vocabulary: parsed.forbidden_vocabulary ?? DEFAULT_POLICY.forbidden_vocabulary,
      infinite_feed_phrases: parsed.infinite_feed_phrases ?? DEFAULT_POLICY.infinite_feed_phrases,
      shaming_phrases: parsed.shaming_phrases ?? DEFAULT_POLICY.shaming_phrases,
      stage_drift_terms: parsed.stage_drift_terms ?? DEFAULT_POLICY.stage_drift_terms,
      max_actions_30_days: parsed.max_actions_30_days ?? DEFAULT_POLICY.max_actions_30_days,
    };
    return cachedPolicy;
  } catch {
    cachedPolicy = DEFAULT_POLICY;
    return cachedPolicy;
  }
}

export function runGlobalDoctrineGuards(stageName: StageName, payload: unknown): GuardResult {
  const policy = loadPolicyConfig();
  const strings = collectStrings(payload).map((item) => item.toLowerCase());
  const failures: GuardFailure[] = [];

  const forbidden = scanTerms(strings, policy.forbidden_vocabulary);
  for (const term of forbidden) {
    failures.push({
      code: "forbidden_vocabulary",
      stage_name: stageName,
      message: `Forbidden language detected: ${term}`,
    });
  }

  const infiniteFeed = scanTerms(strings, policy.infinite_feed_phrases);
  for (const phrase of infiniteFeed) {
    failures.push({
      code: "infinite_feed_language",
      stage_name: stageName,
      message: `Infinite-feed phrase detected: ${phrase}`,
    });
  }

  const shaming = scanTerms(strings, policy.shaming_phrases);
  for (const phrase of shaming) {
    failures.push({
      code: "shaming_language",
      stage_name: stageName,
      message: `Shaming phrase detected: ${phrase}`,
    });
  }

  const rawData = scanForRawDataLeak(strings);
  for (const hit of rawData) {
    failures.push({
      code: "raw_data_exposure",
      stage_name: stageName,
      message: `Potential raw-data exposure detected: ${hit}`,
    });
  }

  for (const refFailure of validateEvidenceRefs(stageName, payload)) {
    failures.push({
      code: "evidence_ref_invalid",
      stage_name: stageName,
      message: refFailure,
    });
  }

  return { passed: failures.length === 0, failures };
}

export function runStageDriftGuards(stageName: StageName, payload: unknown): GuardResult {
  const policy = loadPolicyConfig();
  const strings = collectStrings(payload).map((item) => item.toLowerCase());
  const failures: GuardFailure[] = [];

  const terms = policy.stage_drift_terms[stageName] ?? [];
  const driftHits = scanTerms(strings, terms);
  for (const hit of driftHits) {
    failures.push({
      code: "stage_drift",
      stage_name: stageName,
      message: `Stage drift term detected: ${hit}`,
    });
  }

  if (stageName === "blue_ocean") {
    const stagePayload = payload as StageArtifactMap["blue_ocean"];
    const missingCapacity = stagePayload.asymmetric_moves.some(
      (move) => !/capacity|load|owner time|crew/i.test(move.capacity_check)
    );
    if (missingCapacity) {
      failures.push({
        code: "blue_ocean_capacity_missing",
        stage_name: stageName,
        message: "Blue Ocean moves must include explicit capacity checks.",
      });
    }
  }

  if (stageName === "synthesis_decision") {
    const artifact = payload as DecisionArtifactV1;
    const pathKeys = Object.keys(artifact.paths ?? {}).sort();
    if (pathKeys.join(",") !== "A,B,C") {
      failures.push({
        code: "decision_paths_invalid",
        stage_name: stageName,
        message: "Synthesis stage must include exactly paths A, B, C.",
      });
    }

    if (!["A", "B", "C"].includes(artifact.recommended_path)) {
      failures.push({
        code: "decision_recommendation_invalid",
        stage_name: stageName,
        message: "Synthesis stage must recommend exactly one of A/B/C.",
      });
    }

    if ((artifact.first_30_days ?? []).length < 5 || (artifact.first_30_days ?? []).length > policy.max_actions_30_days) {
      failures.push({
        code: "decision_action_count_invalid",
        stage_name: stageName,
        message: `first_30_days must contain 5-${policy.max_actions_30_days} actions.`,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}

export function runDoctrineGuards(stageName: StageName, payload: unknown): GuardResult {
  const global = runGlobalDoctrineGuards(stageName, payload);
  const drift = runStageDriftGuards(stageName, payload);
  const failures = [...global.failures, ...drift.failures];
  return { passed: failures.length === 0, failures };
}