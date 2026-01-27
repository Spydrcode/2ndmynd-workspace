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
  '1be9f533-aec5-4513-86c5-c7041c659cb1',
  '5d052f04-7e7a-4d0b-85c9-96b4cc00f37f',
  '8dd72e3c-d5e6-4354-abf7-edf0c2e2334b',
  'a6e9cd2e-facf-43da-a1c9-9fa505f084fd',
];

const outTrain = path.resolve('tmp/train_v2_conclusion_patched.jsonl');
const origTrain = path.resolve('tmp/train_v2_conclusion.jsonl');

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

function makeAssistantOutput(snapshot: any, variant = 0) {
  const evidence = evidenceFromSnapshot(snapshot, 3 + (variant % 3));

  // decision heuristics: if quotes/invoices zero-ish -> recommend investigate/watch rather than no_action_needed
  const quotes = snapshot.window?.quotes ?? 0;
  const invoices = snapshot.window?.invoices ?? 0;
  let decision = 'investigate';
  if (quotes > invoices && quotes - invoices >= 5) decision = 'investigate';
  else if (quotes === 0 && invoices === 0) decision = 'investigate';
  else decision = variant === 0 ? 'watch' : 'investigate';

  const boundary =
    variant === 0
      ? `If ${evidence[0] ?? "signals.unknown=unknown"} remains 0 for 14 days, escalate to owner`
      : `Trigger when ${evidence[0] ?? "signals.unknown=unknown"} drops below historical baseline for 14 days`;

  const assistant = {
    conclusion_version: 'conclusion_v1',
    pattern_id: `fix-${snapshot.snapshot_version || 's'}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    one_sentence_pattern: `Auto-corrected: ${snapshot.window?.quotes ?? '0'} quotes vs ${snapshot.window?.invoices ?? '0'} invoices`,
    decision,
    boundary,
    why_this_now: 'Corrective training example: evidence_signals reference actual snapshot keys and boundary is presented as a trigger. Avoid forbidden terms.',
    confidence: 'medium',
    evidence_signals: evidence,
  };

  return JSON.stringify(assistant);
}

async function main() {
  const lines: string[] = [];
  if (fs.existsSync(origTrain)) {
    const orig = fs.readFileSync(origTrain, 'utf8').split(/\r?\n/).filter(Boolean);
    lines.push(...orig);
  }

  for (const id of failing) {
    const ex = await fetchExample(id);
    if (!ex) {
      console.warn('Missing example', id);
      continue;
    }
    const userMsg = JSON.stringify(ex.input_snapshot);
    // two variants per failing example
    for (let v = 0; v < 2; v++) {
      const sys = { role: 'system', content: 'output only JSON matching conclusion_v1' };
      const user = { role: 'user', content: userMsg };
      const assistantContent = makeAssistantOutput(ex.input_snapshot, v);
      const obj = { messages: [sys, user, { role: 'assistant', content: assistantContent }] };
      lines.push(JSON.stringify(obj));
    }
  }

  fs.writeFileSync(outTrain, lines.join('\n') + '\n');
  console.log('Wrote patched training file to', outTrain);

  // create validation file: take first 10 original lines (if available)
  const validOut = path.resolve('tmp/valid_v2_conclusion.jsonl');
  const origLines = fs.existsSync(origTrain) ? fs.readFileSync(origTrain, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const valid = origLines.slice(0, 10);
  fs.writeFileSync(validOut, valid.join('\n') + '\n');
  console.log('Wrote validation file to', validOut);
}

main().catch((e) => { console.error(e); process.exit(1); });
