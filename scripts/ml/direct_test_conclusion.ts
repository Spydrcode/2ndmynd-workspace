import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import dotenv from 'dotenv';
import { DEFAULT_DECISION_MODEL_ID_V1, REWRITE_SYSTEM_PROMPT_V1 } from "./lib/decision_layer_v1";
dotenv.config();

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE envs for fetching example");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  ) as any;

  const dataset = process.argv[2] || 'smoke_messy';
  const badOutputArg = process.argv[4];

  const { data } = await supabase
    .schema('ml')
    .from('datasets')
    .select('example_ids')
    .eq('name', dataset)
    .maybeSingle();

  if (!data || !Array.isArray(data.example_ids) || data.example_ids.length === 0) {
    console.error('No examples found for dataset', dataset);
    process.exit(1);
  }

  const exampleId = data.example_ids[0];
  const { data: examples } = await supabase
    .schema('ml')
    .from('examples')
    .select('id, input_snapshot')
    .eq('id', exampleId)
    .limit(1);

  const example = (examples || [])[0];
  if (!example) {
    console.error('Example not found');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const CONCLUSION_V1_JSON_SCHEMA = {
    type: "object",
    required: [
      "conclusion_version",
      "pattern_id",
      "one_sentence_pattern",
      "decision",
      "boundary",
      "why_this_now",
      "confidence",
      "evidence_signals",
    ],
    properties: {
      conclusion_version: { type: "string", const: "conclusion_v1" },
      pattern_id: { type: "string" },
      one_sentence_pattern: { type: "string" },
      decision: { type: "string" },
      boundary: { type: "string" },
      why_this_now: { type: "string" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      evidence_signals: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
    },
    additionalProperties: false,
  } as const;

  const systemPrompt = REWRITE_SYSTEM_PROMPT_V1;

  let badOutput: unknown = {};
  if (badOutputArg) {
    try {
      if (fs.existsSync(badOutputArg)) {
        badOutput = JSON.parse(fs.readFileSync(badOutputArg, "utf8"));
      } else {
        badOutput = JSON.parse(badOutputArg);
      }
    } catch {
      badOutput = { raw_text: badOutputArg };
    }
  }

  const payload = {
    model: process.env.TEST_MODEL || process.argv[3] || DEFAULT_DECISION_MODEL_ID_V1,
    temperature: 0,
    top_p: 0.1,
    presence_penalty: 0,
    frequency_penalty: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ snapshot: example.input_snapshot, bad_output: badOutput }) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'conclusion_v1',
        strict: true,
        schema: CONCLUSION_V1_JSON_SCHEMA,
      },
    },
  } as any;

  // redact API key when printing payload
  const payloadForLog = { ...payload };
  console.log('=== CALL PAYLOAD ===');
  console.log(JSON.stringify({ ...payloadForLog, apiKey: 'REDACTED' }, null, 2));

  const completion = await client.chat.completions.create(payload);

  console.log('=== RAW COMPLETION CHOICE ===');
  console.log(JSON.stringify(completion.choices?.[0]?.message ?? completion, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
