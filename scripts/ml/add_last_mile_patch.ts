import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE envs');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }) as any;

const failing = [
  '8dd72e3c-d5e6-4354-abf7-edf0c2e2334b', // messy remaining fail
  '1b2f3c5e-df5b-4cb3-9673-325e0c339378', // clean remaining fails
  '697f55ad-b1c5-4e8a-9323-19cd4c8f6b9e',
];

const outPath = path.resolve('tmp/train_v2_conclusion_patch2.jsonl');
const basePatched = path.resolve('tmp/train_v2_conclusion_patched.jsonl');

async function fetchExample(id: string) {
  const { data } = await supabase.schema('ml').from('examples').select('id,input_snapshot').eq('id', id).limit(1).maybeSingle();
  return data;
}

function literalToString(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return JSON.stringify(v);
}

function collectSignalPaths(snapshot: any) {
  const results: { path: string; value: unknown }[] = [];

  const walk = (node: any, prefix: string) => {
    if (node === null || node === undefined) return;
    if (typeof node !== "object") {
      results.push({ path: prefix, value: node });
      return;
    }
    if (Array.isArray(node)) return;
    for (const key of Object.keys(node)) {
      walk(node[key], `${prefix}.${key}`);
    }
  };

  if (snapshot?.signals && typeof snapshot.signals === "object") {
    walk(snapshot.signals, "signals");
  } else if (snapshot?.signals_flat && typeof snapshot.signals_flat === "object") {
    for (const [key, value] of Object.entries(snapshot.signals_flat)) {
      results.push({ path: `signals.${key}`, value });
    }
  }

  return results.filter((item) => item.value === null || typeof item.value !== "object");
}

function evidenceFromSnapshot(snapshot: any, count: number) {
  const candidates = collectSignalPaths(snapshot);
  return candidates.slice(0, Math.min(count, candidates.length)).map((item) => {
    return `${item.path}=${literalToString(item.value)}`;
  });
}

function makeCorrectivePositive(snapshot: any, idx: number) {
  const evidence_signals = evidenceFromSnapshot(snapshot, 3);
  const assistant = {
    conclusion_version: 'conclusion_v1',
    pattern_id: `patch-pos-${snapshot.snapshot_version || 's'}-${Date.now()}-${idx}`,
    one_sentence_pattern: `Corrective positive: ${snapshot.window?.quotes ?? 0} quotes vs ${snapshot.window?.invoices ?? 0} invoices`,
    decision: 'investigate',
    boundary: `Trigger: if ${evidence_signals[0] ?? "signals.unknown=unknown"} remains unchanged for 14 days, escalate to owner`,
    why_this_now: 'Training corrective positive: evidence_signals must be exact snapshot keys, boundary is a trigger, and forbidden terms avoided.',
    confidence: 'medium',
    evidence_signals,
  };
  return assistant;
}

function makeNegativeBadThenFix(snapshot: any, idx: number) {
  const evidence_signals = evidenceFromSnapshot(snapshot, 3);
  const badEvidence = ['quotes_count is 0', 'invoices_count is 0', 'nonexistent_key_xyz'];
  const badAssistant = {
    conclusion_version: 'conclusion_v1',
    pattern_id: `bad-${snapshot.snapshot_version || 's'}-${Date.now()}-${idx}`,
    one_sentence_pattern: `Bad: prose and wrong evidence`,
    decision: 'no_action_needed',
    boundary: '2025-11-29 to 2025-12-08',
    why_this_now: 'Bad output uses prose and forbidden term monitoring; evidence uses phrases not keys.',
    confidence: 'high',
    evidence_signals: badEvidence,
  };

  // fixed assistant uses real keys and trigger-style boundary
  const fixedAssistant = {
    conclusion_version: 'conclusion_v1',
    pattern_id: `fix-${snapshot.snapshot_version || 's'}-${Date.now()}-${idx}`,
    one_sentence_pattern: `Fixed: evidence references exact keys and boundary is a trigger`,
    decision: 'investigate',
    boundary: `Trigger when ${evidence_signals[0] ?? "signals.unknown=unknown"} stays unchanged for 14 days`,
    why_this_now: 'Negative example corrected: evidence_signals are exact keys and forbidden terms removed.',
    confidence: 'medium',
    evidence_signals,
  };

  return { badAssistant, fixedAssistant };
}

async function main() {
  const outLines: string[] = [];

  // start from existing patched file if present
  if (fs.existsSync(basePatched)) {
    const existing = fs.readFileSync(basePatched, 'utf8').split(/\r?\n/).filter(Boolean);
    outLines.push(...existing);
  }

  let counter = 0;
  // create 4 corrective positives (spread across failing examples)
  for (let i = 0; i < 4; i++) {
    const id = failing[i % failing.length];
    const ex = await fetchExample(id);
    if (!ex) continue;
    const assistant = makeCorrectivePositive(ex.input_snapshot, counter++);
    const obj = { messages: [ { role: 'system', content: 'output only JSON matching conclusion_v1' }, { role: 'user', content: JSON.stringify(ex.input_snapshot) }, { role: 'assistant', content: JSON.stringify(assistant) } ] };
    outLines.push(JSON.stringify(obj));
  }

  // create 4 negatives (BAD OUTPUT + FIX IT)
  for (let i = 0; i < 4; i++) {
    const id = failing[i % failing.length];
    const ex = await fetchExample(id);
    if (!ex) continue;
    const { badAssistant, fixedAssistant } = makeNegativeBadThenFix(ex.input_snapshot, counter++);
    const userBad = `BAD OUTPUT:\n${JSON.stringify(badAssistant)}\n\nFIX IT: produce a corrected JSON that matches conclusion_v1, uses exact snapshot keys in evidence_signals, uses trigger-style boundary, and avoids forbidden terms.`;
    const obj = { messages: [ { role: 'system', content: 'output only JSON matching conclusion_v1' }, { role: 'user', content: JSON.stringify(ex.input_snapshot) + '\n\n' + userBad }, { role: 'assistant', content: JSON.stringify(fixedAssistant) } ] };
    outLines.push(JSON.stringify(obj));
  }

  fs.writeFileSync(outPath, outLines.join('\n') + '\n');
  console.log('Wrote patch file to', outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
