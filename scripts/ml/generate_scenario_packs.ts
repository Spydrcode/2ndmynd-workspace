import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { PATTERNS, confidenceForPattern, scoreSignature } from "./scenarios/pattern_library";
import { DISTINCTIVE_KEYS, SIGNAL_KEYS, SIGNAL_SCHEMA } from "./scenarios/signal_schema";

type Args = {
  outDir: string;
  nPerPattern: number;
  seed: number;
  includeNegatives: boolean;
  sources: string[];
  hardMode: boolean;
  mixRate: number;
  counterexampleRate: number;
  nullRate: number;
  minPerPattern: number;
  fallbackThreshold: number;
  enableFallback: boolean;
  onlyPatterns?: string[];
  maxTotalPacks?: number;
};

const DEFAULTS: Args = {
  outDir: "./ml_scenarios",
  nPerPattern: 40,
  seed: 123,
  includeNegatives: true,
  sources: ["kaggle", "synthetic", "jobber", "contracting"],
  hardMode: true,
  mixRate: 0.35,
  counterexampleRate: 0.25,
  nullRate: 0,
  minPerPattern: 60,
  fallbackThreshold: 0.35,
  enableFallback: true,
};

type SnapshotV1 = {
  snapshot_version: "snapshot_v1";
  pii_scrubbed: true;
  signals: Record<string, string>;
};

type ScenarioPack = {
  id: string;
  source: "synthetic" | "kaggle" | "jobber" | "blend";
  input_snapshot: SnapshotV1;
  expected: {
    pattern_id: string;
    conclusion_v1: Record<string, unknown>;
  };
  negatives?: Array<{
    input_snapshot: SnapshotV1;
    expected_pattern_id: string;
  }>;
  meta?: {
    mixed?: boolean;
    counterexample?: boolean;
    null_case?: boolean;
    primary_pattern?: string;
    secondary_pattern?: string;
    max_signature_strength?: number;
    fallback_applied?: boolean;
  };
  split: "train" | "eval";
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    switch (key) {
      case "--out_dir":
        if (value) args.outDir = value;
        break;
      case "--n_per_pattern":
        if (value) args.nPerPattern = Number(value);
        break;
      case "--min_per_pattern":
        if (value) args.minPerPattern = Number(value);
        break;
      case "--seed":
        if (value) args.seed = Number(value);
        break;
      case "--include_negatives":
        args.includeNegatives = value ? value !== "false" : true;
        break;
      case "--hard_mode":
        args.hardMode = value ? value !== "false" : true;
        break;
      case "--mix_rate":
        if (value) args.mixRate = Number(value);
        break;
      case "--counterexample_rate":
        if (value) args.counterexampleRate = Number(value);
        break;
      case "--null_rate":
        if (value) args.nullRate = Number(value);
        break;
      case "--fallback_threshold":
        if (value) args.fallbackThreshold = Number(value);
        break;
      case "--enable_fallback":
        args.enableFallback = value ? value !== "false" : true;
        break;
      case "--sources":
        if (value) args.sources = value.split(",").map((item) => item.trim());
        break;
      case "--only_patterns":
        if (value) args.onlyPatterns = value.split(",").map((item) => item.trim());
        break;
      case "--max_total_packs":
        if (value) args.maxTotalPacks = Number(value);
        break;
      default:
        break;
    }
  }
  return args;
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: T[]) {
  return items[Math.floor(rng() * items.length)];
}

function shuffle<T>(rng: () => number, items: T[]) {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function buildBaseSignals(rng: () => number) {
  const signals: Record<string, string> = {};
  for (const key of SIGNAL_KEYS) {
    signals[key] = pick(rng, SIGNAL_SCHEMA[key]);
  }
  return signals;
}

function applySignature(
  rng: () => number,
  signals: Record<string, string>,
  rules: (typeof PATTERNS)[number]["signature_rules"]
) {
  for (const rule of rules.required) {
    signals[rule.key] = pick(rng, rule.allowed);
  }
  for (const rule of rules.optional) {
    if (rng() > 0.4) {
      signals[rule.key] = pick(rng, rule.allowed);
    }
  }
  return signals;
}

function buildConclusion(
  rng: () => number,
  patternId: string,
  signals: Record<string, string>,
  overlay?: string
) {
  const pattern = PATTERNS.find((item) => item.pattern_id === patternId);
  if (!pattern) {
    throw new Error(`Unknown pattern ${patternId}`);
  }
  const score = scoreSignature(signals, pattern.signature_rules);
  const confidence = confidenceForPattern(score);
  const candidates = pattern.evidence_signal_candidates.filter((key) => key in signals);
  const fallback = Object.keys(signals);
  const pool = candidates.length >= 3 ? candidates : fallback;
  const count = Math.min(6, Math.max(3, Math.floor(3 + rng() * 4)));
  const evidence_signals = shuffle(rng, pool).slice(0, Math.min(count, pool.length));
  return pattern.buildConclusion({ confidence, evidence_signals, overlay });
}

function buildEvidenceForMix(
  rng: () => number,
  primary: typeof PATTERNS[number],
  secondary: typeof PATTERNS[number],
  signals: Record<string, string>
) {
  const primaryKeys = primary.evidence_signal_candidates.filter((key) => key in signals);
  const secondaryKeys = secondary.evidence_signal_candidates.filter((key) => key in signals);
  const evidence = new Set<string>();
  const distinctive = DISTINCTIVE_KEYS[primary.pattern_id] ?? [];
  const distinctiveHits = distinctive.filter((key) => key in signals);

  if (distinctiveHits.length > 0) {
    evidence.add(pick(rng, distinctiveHits));
  }
  shuffle(rng, primaryKeys)
    .filter((key) => !evidence.has(key))
    .slice(0, 2)
    .forEach((key) => evidence.add(key));
  if (secondaryKeys.length > 0) {
    evidence.add(pick(rng, secondaryKeys));
  }

  const remaining = shuffle(
    rng,
    [...primaryKeys, ...secondaryKeys].filter((key) => !evidence.has(key))
  );
  for (const key of remaining) {
    if (evidence.size >= 6) break;
    evidence.add(key);
    if (evidence.size >= 3 && rng() > 0.5) break;
  }

  return Array.from(evidence);
}

function getMaxSignatureStrength(signals: Record<string, string>) {
  let maxStrength = 0;
  for (const pattern of PATTERNS) {
    if (pattern.pattern_id === "low_impact_boundary") continue;
    const strength = pattern.signature_strength(signals);
    if (strength > maxStrength) maxStrength = strength;
  }
  return maxStrength;
}

function pickDistinctiveEvidence(
  rng: () => number,
  patternId: string,
  signals: Record<string, string>,
  pool: string[]
) {
  const distinctive = DISTINCTIVE_KEYS[patternId] ?? [];
  const distinctiveHits = distinctive.filter((key) => key in signals);
  const evidence = new Set<string>();
  if (distinctiveHits.length > 0) {
    evidence.add(pick(rng, distinctiveHits));
  }
  const shuffled = shuffle(
    rng,
    pool.filter((key) => !evidence.has(key))
  );
  for (const key of shuffled) {
    if (evidence.size >= 6) break;
    evidence.add(key);
    if (evidence.size >= 3 && rng() > 0.5) break;
  }
  return Array.from(evidence);
}

function hasDistinctiveEvidence(patternId: string, evidence: string[]) {
  const distinctive = DISTINCTIVE_KEYS[patternId] ?? [];
  return evidence.some((key) => distinctive.includes(key));
}

function buildFallbackEvidence(signals: Record<string, string>, rng: () => number) {
  const lightKeys = Object.entries(signals)
    .filter(([, value]) => value === "low" || value === "flat")
    .map(([key]) => key);
  const distinctive = DISTINCTIVE_KEYS.low_impact_boundary ?? [];
  const distinctiveHits = distinctive.filter((key) => key in signals);
  const pool = lightKeys.length >= 3 ? lightKeys : Object.keys(signals);
  const evidence = new Set<string>();
  if (distinctiveHits.length > 0) {
    evidence.add(pick(rng, distinctiveHits));
  }
  for (const key of shuffle(rng, pool)) {
    if (evidence.size >= 4) break;
    evidence.add(key);
    if (evidence.size >= 3 && rng() > 0.5) break;
  }
  return Array.from(evidence);
}

function weakenSignature(
  rng: () => number,
  signals: Record<string, string>,
  pattern: typeof PATTERNS[number]
) {
  const requiredKeys = pattern.signature_rules.required.map((rule) => rule.key);
  if (requiredKeys.length === 0) return;
  const targetKey = pick(rng, requiredKeys);
  const allowed = pattern.signature_rules.required.find((rule) => rule.key === targetKey)?.allowed;
  const options = SIGNAL_SCHEMA[targetKey] ?? ["low", "medium", "high"];
  const disallowed = options.filter((value) => !allowed?.includes(value));
  if (disallowed.length > 0) {
    signals[targetKey] = pick(rng, disallowed);
  }
}

function overlayContracting(signals: Record<string, string>, rng: () => number) {
  signals["crew_capacity.band"] = pick(rng, ["low", "medium", "high"]);
  signals["weather_disruption.band"] = pick(rng, ["low", "medium", "high"]);
  signals["seasonality.band"] = pick(rng, ["low", "medium", "high"]);
  signals["job_mix.band"] = pick(rng, ["low", "medium", "high"]);

  if (signals["seasonality.band"] === "high") {
    return "a seasonal pulse";
  }
  if (signals["weather_disruption.band"] === "high") {
    return "weather disruptions";
  }
  if (signals["crew_capacity.band"] === "low") {
    return "a tighter crew window";
  }
  return "the next few weeks";
}

function loadKaggleSnapshots() {
  const dir = path.resolve("./seed/kaggle_transformed");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".snapshots.json"));
  const snapshots: SnapshotV1[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const parsed = JSON.parse(raw) as SnapshotV1[];
    for (const entry of parsed) {
      if (entry?.signals) snapshots.push(entry);
    }
  }
  return snapshots;
}

async function loadJobberSnapshots() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase
    .schema("ml")
    .from("examples")
    .select("input_snapshot, tags")
    .contains("tags", ["jobber"])
    .limit(200);

  if (error) return [];

  const snapshots: SnapshotV1[] = [];
  for (const row of data ?? []) {
    if (row?.input_snapshot?.signals) {
      snapshots.push(row.input_snapshot as SnapshotV1);
    }
  }
  return snapshots;
}

function inferPatternFromSignals(signals: Record<string, string>) {
  let best = PATTERNS[0];
  let bestScore = -1;
  let maxStrength = 0;
  for (const pattern of PATTERNS) {
    if (pattern.pattern_id === "low_impact_boundary") continue;
    const score = scoreSignature(signals, pattern.signature_rules);
    if (score > bestScore) {
      bestScore = score;
      best = pattern;
    }
    const strength = pattern.signature_strength(signals);
    if (strength > maxStrength) maxStrength = strength;
  }
  return { patternId: best.pattern_id, maxStrength };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rng = mulberry32(args.seed);

  const includeKaggle = args.sources.includes("kaggle");
  const includeJobber = args.sources.includes("jobber");
  const includeContracting = args.sources.includes("contracting");

  const kaggleSnapshots = includeKaggle ? loadKaggleSnapshots() : [];
  const jobberSnapshots = includeJobber ? await loadJobberSnapshots() : [];

  const packs: ScenarioPack[] = [];
  let skippedDistinctive = 0;

  const perPattern = Math.max(args.nPerPattern, args.minPerPattern);

  const filteredPatterns = args.onlyPatterns
    ? PATTERNS.filter((p) => args.onlyPatterns!.includes(p.pattern_id))
    : PATTERNS;

  for (const pattern of filteredPatterns) {
    if (pattern.pattern_id === "low_impact_boundary") continue;
    if (args.maxTotalPacks && packs.length >= args.maxTotalPacks) break;
    for (let i = 0; i < perPattern; i += 1) {
      let packBuilt: ScenarioPack | null = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        let signals = buildBaseSignals(rng);
        signals = applySignature(rng, signals, pattern.signature_rules);
        const snapshot: SnapshotV1 = {
          snapshot_version: "snapshot_v1",
          pii_scrubbed: true,
          signals,
        };

        let overlay: string | undefined;
        let source: ScenarioPack["source"] = "synthetic";
        if (includeContracting && rng() > 0.6) {
          overlay = overlayContracting(signals, rng);
          source = "blend";
        }

        let expectedPattern = pattern.pattern_id;
        let secondaryPattern: string | undefined;
        let evidenceOverride: string[] | undefined;
        let counterexample = false;
        let mixed = false;
        let nullRequested = false;

        if (args.hardMode && rng() < args.mixRate) {
          const secondary = pick(
            rng,
            PATTERNS.filter(
              (item) =>
                item.pattern_id !== pattern.pattern_id &&
                item.pattern_id !== "low_impact_boundary"
            )
          );
          secondaryPattern = secondary.pattern_id;
          signals = applySignature(rng, signals, secondary.signature_rules);
          mixed = true;
          evidenceOverride = buildEvidenceForMix(rng, pattern, secondary, signals);
        }

        if (args.hardMode && rng() < args.counterexampleRate) {
          counterexample = true;
          weakenSignature(rng, signals, pattern);
          const counters =
            pattern.counter_patterns.length > 0
              ? pattern.counter_patterns
              : PATTERNS.filter(
                  (item) =>
                    item.pattern_id !== pattern.pattern_id &&
                    item.pattern_id !== "low_impact_boundary"
                ).map((item) => item.pattern_id);
          expectedPattern = pick(rng, counters);
          mixed = false;
          secondaryPattern = undefined;
          evidenceOverride = undefined;
        }

        if (args.hardMode && args.nullRate > 0 && rng() < args.nullRate) {
          nullRequested = true;
          weakenSignature(rng, signals, pattern);
        }

        const maxStrength = getMaxSignatureStrength(signals);
        let fallbackApplied = false;
        if (args.enableFallback && maxStrength < args.fallbackThreshold) {
          expectedPattern = "low_impact_boundary";
          mixed = false;
          counterexample = false;
          secondaryPattern = undefined;
          evidenceOverride = undefined;
          fallbackApplied = true;
        }

        const conclusion = buildConclusion(rng, expectedPattern, signals, overlay);
        if (expectedPattern === "low_impact_boundary") {
          (conclusion as any).evidence_signals = buildFallbackEvidence(signals, rng);
          (conclusion as any).confidence = "low";
        } else if (evidenceOverride) {
          (conclusion as any).evidence_signals = evidenceOverride;
        } else {
          const patternDef = PATTERNS.find((item) => item.pattern_id === expectedPattern);
          const candidates =
            patternDef?.evidence_signal_candidates.filter((key) => key in signals) ?? [];
          const fallback = Object.keys(signals);
          const pool = candidates.length >= 3 ? candidates : fallback;
          (conclusion as any).evidence_signals = pickDistinctiveEvidence(
            rng,
            expectedPattern,
            signals,
            pool
          );
        }

        const evidenceSignals = Array.isArray((conclusion as any).evidence_signals)
          ? ((conclusion as any).evidence_signals as string[])
          : [];
        if (!hasDistinctiveEvidence(expectedPattern, evidenceSignals)) {
          continue;
        }

        const pack: ScenarioPack = {
          id: randomUUID(),
          source,
          input_snapshot: snapshot,
          expected: {
            pattern_id: expectedPattern,
            conclusion_v1: conclusion,
          },
          meta: {
            mixed,
            counterexample,
            null_case: expectedPattern === "low_impact_boundary",
            primary_pattern: pattern.pattern_id,
            secondary_pattern: secondaryPattern,
            max_signature_strength: maxStrength,
            fallback_applied: fallbackApplied,
          },
          split: rng() > 0.2 ? "train" : "eval",
        };

        if (
          args.includeNegatives &&
          rng() > 0.5 &&
          expectedPattern !== "low_impact_boundary"
        ) {
          const altPattern = pick(
            rng,
            PATTERNS.filter(
              (p) =>
                p.pattern_id !== expectedPattern && p.pattern_id !== "low_impact_boundary"
            )
          );
          const altSignals = applySignature(rng, { ...signals }, altPattern.signature_rules);
          pack.negatives = [
            {
              input_snapshot: {
                snapshot_version: "snapshot_v1",
                pii_scrubbed: true,
                signals: altSignals,
              },
              expected_pattern_id: altPattern.pattern_id,
            },
          ];
        }

        packBuilt = pack;
        break;
      }

      if (!packBuilt) {
        skippedDistinctive += 1;
        continue;
      }

      packs.push(packBuilt);
    }
  }

  const kaggleSample = shuffle(rng, kaggleSnapshots).slice(0, perPattern * 2);
  for (const snapshot of kaggleSample) {
    const signals = { ...snapshot.signals };
    let overlay: string | undefined;
    if (includeContracting && rng() > 0.5) {
      overlay = overlayContracting(signals, rng);
    }
    const inferred = inferPatternFromSignals(signals);
    let patternId = inferred.patternId;
    let fallbackApplied = false;
    if (args.enableFallback && inferred.maxStrength < args.fallbackThreshold) {
      patternId = "low_impact_boundary";
      fallbackApplied = true;
    }
    const conclusion = buildConclusion(rng, patternId, signals, overlay);
    if (patternId === "low_impact_boundary") {
      (conclusion as any).evidence_signals = buildFallbackEvidence(signals, rng);
      (conclusion as any).confidence = "low";
    } else {
      const patternDef = PATTERNS.find((item) => item.pattern_id === patternId);
      const candidates =
        patternDef?.evidence_signal_candidates.filter((key) => key in signals) ?? [];
      const fallback = Object.keys(signals);
      const pool = candidates.length >= 3 ? candidates : fallback;
      (conclusion as any).evidence_signals = pickDistinctiveEvidence(
        rng,
        patternId,
        signals,
        pool
      );
    }
    const evidenceSignals = Array.isArray((conclusion as any).evidence_signals)
      ? ((conclusion as any).evidence_signals as string[])
      : [];
    if (!hasDistinctiveEvidence(patternId, evidenceSignals)) {
      skippedDistinctive += 1;
      continue;
    }
    const pack: ScenarioPack = {
      id: randomUUID(),
      source: "kaggle",
      input_snapshot: {
        snapshot_version: "snapshot_v1",
        pii_scrubbed: true,
        signals,
      },
      expected: { pattern_id: patternId, conclusion_v1: conclusion },
      meta: {
        max_signature_strength: inferred.maxStrength,
        fallback_applied: fallbackApplied,
      },
      split: rng() > 0.2 ? "train" : "eval",
    };
    if (args.includeNegatives && rng() > 0.7) {
      const altPattern = pick(
        rng,
        PATTERNS.filter((p) => p.pattern_id !== patternId)
      );
      const altSignals = applySignature(rng, { ...signals }, altPattern.signature_rules);
      pack.negatives = [
        {
          input_snapshot: {
            snapshot_version: "snapshot_v1",
            pii_scrubbed: true,
            signals: altSignals,
          },
          expected_pattern_id: altPattern.pattern_id,
        },
      ];
    }
    packs.push(pack);
  }

  const jobberSample = shuffle(rng, jobberSnapshots).slice(0, perPattern * 2);
  for (const snapshot of jobberSample) {
    const signals = { ...snapshot.signals };
    let overlay: string | undefined;
    if (includeContracting && rng() > 0.6) {
      overlay = overlayContracting(signals, rng);
    }
    const inferred = inferPatternFromSignals(signals);
    let patternId = inferred.patternId;
    let fallbackApplied = false;
    if (args.enableFallback && inferred.maxStrength < args.fallbackThreshold) {
      patternId = "low_impact_boundary";
      fallbackApplied = true;
    }
    const conclusion = buildConclusion(rng, patternId, signals, overlay);
    if (patternId === "low_impact_boundary") {
      (conclusion as any).evidence_signals = buildFallbackEvidence(signals, rng);
      (conclusion as any).confidence = "low";
    } else {
      const patternDef = PATTERNS.find((item) => item.pattern_id === patternId);
      const candidates =
        patternDef?.evidence_signal_candidates.filter((key) => key in signals) ?? [];
      const fallback = Object.keys(signals);
      const pool = candidates.length >= 3 ? candidates : fallback;
      (conclusion as any).evidence_signals = pickDistinctiveEvidence(
        rng,
        patternId,
        signals,
        pool
      );
    }
    const evidenceSignals = Array.isArray((conclusion as any).evidence_signals)
      ? ((conclusion as any).evidence_signals as string[])
      : [];
    if (!hasDistinctiveEvidence(patternId, evidenceSignals)) {
      skippedDistinctive += 1;
      continue;
    }
    const pack: ScenarioPack = {
      id: randomUUID(),
      source: "jobber",
      input_snapshot: {
        snapshot_version: "snapshot_v1",
        pii_scrubbed: true,
        signals,
      },
      expected: { pattern_id: patternId, conclusion_v1: conclusion },
      meta: {
        max_signature_strength: inferred.maxStrength,
        fallback_applied: fallbackApplied,
      },
      split: rng() > 0.2 ? "train" : "eval",
    };
    if (args.includeNegatives && rng() > 0.7) {
      const altPattern = pick(
        rng,
        PATTERNS.filter((p) => p.pattern_id !== patternId)
      );
      const altSignals = applySignature(rng, { ...signals }, altPattern.signature_rules);
      pack.negatives = [
        {
          input_snapshot: {
            snapshot_version: "snapshot_v1",
            pii_scrubbed: true,
            signals: altSignals,
          },
          expected_pattern_id: altPattern.pattern_id,
        },
      ];
    }
    packs.push(pack);
  }

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "packs.json"), JSON.stringify(packs, null, 2));

  const evalPacks = packs.filter((pack) => pack.split === "eval");
  fs.writeFileSync(
    path.join(outDir, "packs_eval.json"),
    JSON.stringify(evalPacks, null, 2)
  );

  const jsonl = packs.map((pack) => {
    const system =
      "You are an internal 2ndmynd decision model. Your job is to reduce owner decision burden by identifying one pattern, one decision, and one boundary. Avoid dashboards, KPIs, monitoring, or performance language.";
    return {
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(pack.input_snapshot) },
        { role: "assistant", content: JSON.stringify(pack.expected.conclusion_v1) },
      ],
    };
  });
  fs.writeFileSync(
    path.join(outDir, "packs.jsonl"),
    `${jsonl.map((line) => JSON.stringify(line)).join("\n")}\n`
  );

  console.log(`wrote ${packs.length} packs to ${outDir}`);
  console.log(`eval packs: ${evalPacks.length}`);
  if (skippedDistinctive > 0) {
    console.log(`skipped packs missing distinctive evidence: ${skippedDistinctive}`);
  }
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
