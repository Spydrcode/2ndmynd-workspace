export const DEFAULT_DECISION_MODEL_ID_V1 =
  "ft:gpt-4.1-mini-2025-04-14:personal:2ndmynd-decision-v2-1769477737888:D2STs7nD";

export const PRIMARY_SYSTEM_PROMPT_V1 = `You must output a single JSON object that exactly matches the conclusion_v1 schema.
Output ONLY JSON. No markdown, no prose, no code fences.
Do not add wrapper keys like "raw_text".
evidence_signals MUST use the form "signals.<path>=<literal_value>" derived from the given snapshot.
Never infer evidence; only reference snapshot fields.
Do not mention "stable invoices" or any stability/volatility comparisons unless you cite a leaf evidence signal that directly supports it.
boundary must be a clear trigger condition starting with "If..." and referencing snapshot leaf fields when possible.
Decisions must be specific and executable in <30 minutes, and boundaries must reference volatility_band or count/lag leaf fields when relevant.
Decisions should be framed as temporary stabilizers (time-boxed or condition-boxed), not permanent process changes.`;

export const REWRITE_SYSTEM_PROMPT_V1 = `You are repairing a conclusion_v1 JSON object.

HARD RULES (must follow exactly):
- Output ONLY a single JSON object that matches the conclusion_v1 schema. No markdown. No prose.
- Do not add any keys outside the schema. Do not wrap in "raw_text".
- evidence_signals MUST be derived ONLY from the provided snapshot object.
- evidence_signals MUST be an array of 3 to 6 strings.
- Each evidence_signals item MUST be formatted exactly as:
  "signals.<full.path.to.field>=<literal_value>"
- Use fully-qualified paths that start with "signals." (not "quotes_count", not "approval_rate_band").
- The value after "=" MUST exactly equal the literal value in the snapshot (no paraphrase).
- Do NOT infer, summarize, or restate evidence. Only reference snapshot fields.
- If you cannot find 3 valid evidence signals, choose different snapshot fields that exist.
- Keep boundary as a trigger/condition string (not a date range) unless the schema explicitly requires a date range.

LEAF-ONLY RULES FOR evidence_signals:
- Each evidence_signals item MUST reference a leaf field (a number/string/boolean/null).
- You MUST NOT use paths that resolve to objects or arrays (e.g. "signals.quotes", "signals.invoices", "signals.payment_lag_band_distribution").
- Choose only leaf keys such as:
  signals.quotes.quotes_count
  signals.quotes.quotes_approved_count
  signals.quotes.approval_rate_band
  signals.quotes.decision_lag_band
  signals.quotes.quote_total_bands.small
  signals.quotes.quote_total_bands.medium
  signals.quotes.quote_total_bands.large
  signals.invoices.invoices_count
  signals.invoices.invoices_paid_count
  signals.invoices.invoice_total_bands.small
  signals.invoices.invoice_total_bands.medium
  signals.invoices.invoice_total_bands.large
  signals.invoices.payment_lag_band_distribution.very_low
  signals.invoices.payment_lag_band_distribution.low
  signals.invoices.payment_lag_band_distribution.medium
  signals.invoices.payment_lag_band_distribution.high
  signals.invoices.payment_lag_band_distribution.very_high
  signals.volatility_band
- Format stays: "signals.<full.leaf.path>=<literal_value>"

You will receive:
1) snapshot: JSON
2) bad_output: JSON (may violate rules)

Return a corrected conclusion_v1 JSON object that passes strict schema validation and grounding.`;
