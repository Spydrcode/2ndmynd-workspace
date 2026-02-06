/**
 * Language Guardrails — Mirror-Back, Non-Accusatory Output Rules
 *
 * DOCTRINE:
 * - We mirror the owner's own words back to them. We don't lecture.
 * - We acknowledge tradeoffs without blame.
 * - We scale certainty of language to match confidence level.
 * - We NEVER use forbidden words/patterns regardless of confidence.
 */

import type { IntentConfidence } from "../types/intent_intake";

// ============================================================================
// FORBIDDEN PATTERNS (absolute blocklist — never appear in output)
// ============================================================================

export const FORBIDDEN_WORDS: RegExp[] = [
  /\byou\s+should\b/i,
  /\byou\s+must\b/i,
  /\byou\s+need\s+to\b/i,
  /\bunderperform/i,
  /\bbest\s+practice/i,
  /\bbenchmark/i,
  /\bindustry\s+average/i,
  /\bindustry\s+standard/i,
  /\bpeer\s+median/i,
  /\bpeer\s+comparison/i,
  /\bnational\s+average/i,
  /\bcompetitor/i,
  /\bfail(ed|ing|ure)?\b/i,
  /\bbad\b/i,
  /\bwrong\b/i,
  /\bbehind\b/i,
  /\bworst\b/i,
  /\bterrible\b/i,
  /\bpoor(ly)?\b/i,
  /\bdeficient\b/i,
  /\binadequate\b/i,
  /\bshame\b/i,
  /\bgolden\s+standard/i,
  /\bpercentile\b/i,
  /\bbest\s+in\s+class/i,
  /\bKPI\b/,
  /\bdashboard\b/i,
  /\bmonitor(ing)?\b/i,
  /\blag(ging|s)?\s+behind/i,
  /\bmissing\s+the\s+mark/i,
  /\bnot\s+good\s+enough/i,
];

// ============================================================================
// DO / DON'T RULES (for documentation + code review)
// ============================================================================

export const LANGUAGE_RULES = {
  DO: [
    'Use "your data suggests…", "it looks like…", "one pattern is…"',
    'Anchor to the owner\'s own words: "you said you care about…"',
    'Acknowledge tradeoffs without blame: "this choice protects X but costs Y"',
    "Keep calm, supportive tone; no hustle energy",
    'Use "appears to", "seems to", "it looks like" for uncertain signals',
    'Frame tensions as structural, not personal: "the business structure creates…"',
    'Scale certainty language to confidence level',
    'Use "and" instead of "but" when possible to reduce adversarial framing',
  ],
  DONT: [
    '"you should", "you must", "you need to"',
    '"underperforming", "best practice", "benchmark"',
    'Shame language: "failed", "bad", "wrong", "behind"',
    "Certainty when confidence is low — hedge appropriately",
    "External comparisons: industry averages, peer medians, competitor data",
    "Dashboard/monitoring language: KPI, metrics, tracking",
    "Hustle energy: urgency without evidence, growth-at-all-costs framing",
    "Prescriptive language that overrides owner autonomy",
  ],
} as const;

// ============================================================================
// CONFIDENCE-SCALED SENTENCE TEMPLATES
// ============================================================================

/**
 * Each template set provides sentence starters for different confidence levels.
 * High: 2-of-3 or 3-of-3 evidence alignment
 * Med:  2-of-3 weakly or incomplete intake
 * Low:  1-of-3; ask to confirm safely
 */

export type TemplateCategory =
  | "intent_summary"
  | "signal_summary"
  | "tension_claim"
  | "boundary_warning"
  | "path_framing";

export type ConfidenceTemplates = Record<IntentConfidence, string[]>;

export const SENTENCE_TEMPLATES: Record<TemplateCategory, ConfidenceTemplates> = {
  intent_summary: {
    high: [
      "You've described a business built around {value}.",
      "Your priorities are clear: {priorities_summary}.",
      "Based on what you shared, {value} is at the core of what you deliver.",
    ],
    med: [
      "From what you've shared so far, it sounds like {value} matters to you.",
      "Your priorities seem to center on {priorities_summary}, though we'd like to confirm.",
      "It looks like {value} is part of how you see your business.",
    ],
    low: [
      "We have limited information about your priorities — here's what we can see so far.",
      "Based on the little we know, it appears {value} may be important to you.",
      "We'd like to understand your priorities better. For now, we're working with what's available.",
    ],
  },

  signal_summary: {
    high: [
      "Your data clearly shows {observation}.",
      "The pattern is consistent: {observation}.",
      "Across {record_count} records, {observation}.",
    ],
    med: [
      "Your data suggests {observation}.",
      "It looks like {observation}, though the data is limited.",
      "One pattern that appears: {observation}.",
    ],
    low: [
      "With the data available, it appears {observation} — but we can't be certain.",
      "There are hints that {observation}, though more data would help confirm.",
      "We see a possible pattern: {observation}. Take this as a starting point, not a conclusion.",
    ],
  },

  tension_claim: {
    high: [
      "You value {intent_anchor}, but {evidence}, which forces {mechanism}.",
      "You care about {intent_anchor}. Your data shows {evidence}, and that creates a real tension: {mechanism}.",
      "{intent_anchor} matters to you. The pattern of {evidence} means {mechanism}.",
    ],
    med: [
      "You've said {intent_anchor} is important. Your data suggests {evidence}, which may mean {mechanism}.",
      "It looks like {intent_anchor} matters to you, and {evidence} creates some tension around that.",
      "There's a possible tension: you value {intent_anchor}, but {evidence} suggests {mechanism}.",
    ],
    low: [
      "If {intent_anchor} is important to you, then {evidence} is worth watching — it could mean {mechanism}.",
      "We see a hint of tension around {intent_anchor}: {evidence}. Worth confirming whether this matches your experience.",
      "There may be a tension between {intent_anchor} and what we see in the data ({evidence}), but we'd want to check with you first.",
    ],
  },

  boundary_warning: {
    high: [
      "If {boundary_condition}, this path may no longer protect what you care about.",
      "Watch for {boundary_condition} — that's the point where this approach stops working.",
      "This path holds as long as {boundary_condition} doesn't happen.",
    ],
    med: [
      "Keep an eye on {boundary_condition}. If that changes, you may want to revisit.",
      "One thing to watch: {boundary_condition}. It could shift the tradeoff.",
      "If {boundary_condition} starts to appear, consider whether this still fits.",
    ],
    low: [
      "We're not sure yet, but {boundary_condition} might be something to keep in mind.",
      "If {boundary_condition} comes up, it may be worth a conversation.",
      "Something to possibly watch: {boundary_condition}.",
    ],
  },

  path_framing: {
    high: [
      "This path protects {protects} by {operational_shift}.",
      "If you choose this, you're prioritizing {protects}. The tradeoff is {tradeoff}.",
      "This is about protecting {protects}. It means {operational_shift}, and it costs {tradeoff}.",
    ],
    med: [
      "This path is designed to protect {protects}, though the tradeoffs aren't fully clear yet.",
      "Choosing this would lean into {protects}. The cost appears to be {tradeoff}.",
      "This looks like it could help with {protects}, at the cost of {tradeoff}.",
    ],
    low: [
      "This path might protect {protects}, but we'd want to confirm the tradeoffs with you.",
      "If {protects} is the priority, this could be a starting point — but we're working with limited data.",
      "We think this direction could help with {protects}. Take it as a suggestion, not a recommendation.",
    ],
  },
};

// ============================================================================
// LANGUAGE RENDERER — renderClaim()
// ============================================================================

export type RenderClaimInput = {
  confidence: IntentConfidence;
  intent_anchor: string;
  evidence: string;
  mechanism: string;
  owner_cost: string;
};

/**
 * Render a tension claim using confidence-appropriate language.
 *
 * Selects a template randomly from the pool for the given confidence level,
 * fills in the placeholders, and validates no forbidden words slip through.
 */
export function renderClaim(input: RenderClaimInput): string {
  const { confidence, intent_anchor, evidence, mechanism, owner_cost } = input;

  const templates = SENTENCE_TEMPLATES.tension_claim[confidence];
  // Deterministic selection based on content hash (not truly random — reproducible)
  const idx = simpleHash(intent_anchor + evidence) % templates.length;
  const template = templates[idx];

  let rendered = template
    .replace(/\{intent_anchor\}/g, intent_anchor)
    .replace(/\{evidence\}/g, evidence)
    .replace(/\{mechanism\}/g, mechanism);

  // Append owner cost if not already embedded
  if (owner_cost && !rendered.includes(owner_cost)) {
    rendered += ` The cost to you: ${owner_cost}.`;
  }

  // Safety: strip any forbidden words that might have leaked from data
  rendered = sanitizeForbidden(rendered);

  return rendered;
}

/**
 * Render a generic template from any category.
 */
export function renderTemplate(
  category: TemplateCategory,
  confidence: IntentConfidence,
  vars: Record<string, string>
): string {
  const templates = SENTENCE_TEMPLATES[category][confidence];
  const key = Object.values(vars).join("");
  const idx = simpleHash(key) % templates.length;
  let rendered = templates[idx];

  for (const [k, v] of Object.entries(vars)) {
    rendered = rendered.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }

  rendered = sanitizeForbidden(rendered);
  return rendered;
}

/**
 * Validate text against all forbidden patterns. Returns list of violations.
 */
export function checkForbiddenLanguage(text: string): string[] {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_WORDS) {
    const match = text.match(pattern);
    if (match) {
      violations.push(match[0]);
    }
  }
  return violations;
}

/**
 * Strip forbidden words from output text (last-resort safety net).
 */
export function sanitizeForbidden(text: string): string {
  let result = text;
  // Only strip the most dangerous patterns; others are design-time errors
  result = result.replace(/\byou\s+should\b/gi, "you could consider");
  result = result.replace(/\byou\s+must\b/gi, "it may help to");
  result = result.replace(/\byou\s+need\s+to\b/gi, "one option is to");
  result = result.replace(/\bunderperform\w*/gi, "not yet aligned");
  result = result.replace(/\bbest\s+practice/gi, "common approach");
  result = result.replace(/\bbenchmark\w*/gi, "reference");
  result = result.replace(/\bfailed?\b/gi, "didn't complete");
  return result;
}

// ── Utility ──

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
