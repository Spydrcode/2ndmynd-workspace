import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const inPath = process.argv[2] || 'tmp/train_v2_repaired.jsonl';
const outPath = process.argv[3] || 'tmp/train_v2_conclusion.jsonl';

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}

function mapAssistantToConclusion(assistant: any, user: any, idx: number) {
  const conclusion: any = {};
  conclusion.conclusion_version = 'conclusion_v1';
  conclusion.pattern_id = `pattern-${idx}-${randomUUID().slice(0,8)}`;
  // one sentence pattern: prefer first top_patterns.pattern or summary short
  if (Array.isArray(assistant.top_patterns) && assistant.top_patterns[0]?.pattern) {
    conclusion.one_sentence_pattern = assistant.top_patterns[0].pattern;
  } else if (typeof assistant.summary === 'string') {
    conclusion.one_sentence_pattern = assistant.summary.split('.')[0];
  } else {
    conclusion.one_sentence_pattern = 'pattern detected';
  }
  // decision: use first recommended change or summary
  if (Array.isArray(assistant.recommended_builds_or_changes) && assistant.recommended_builds_or_changes[0]?.recommendation) {
    conclusion.decision = assistant.recommended_builds_or_changes[0].recommendation;
  } else if (assistant.summary) {
    conclusion.decision = assistant.summary;
  } else {
    conclusion.decision = 'No decision provided';
  }
  // boundary: compose from what_does_not_need_to_change or core_constraint
  if (Array.isArray(assistant.what_does_not_need_to_change) && assistant.what_does_not_need_to_change.length>0) {
    conclusion.boundary = `Do not change: ${assistant.what_does_not_need_to_change.join('; ')}`;
  } else if (assistant.core_constraint?.constraint) {
    conclusion.boundary = `Constraint: ${assistant.core_constraint.constraint}`;
  } else {
    conclusion.boundary = 'Apply when context matches input snapshot signals';
  }
  // why_this_now: use summary
  conclusion.why_this_now = assistant.summary ?? 'No rationale provided';
  // confidence mapping
  const conf = (assistant.confidence || '').toLowerCase();
  conclusion.confidence = conf === 'high' ? 'high' : conf === 'med' || conf === 'medium' ? 'medium' : 'low';
  // evidence_signals: pick user.evidence or keys from user signals
  if (Array.isArray(user.evidence) && user.evidence.length>0) {
    conclusion.evidence_signals = user.evidence.slice(0,6);
  } else {
    const keys = [] as string[];
    if (user.window) keys.push(...Object.keys(user.window));
    if (user.financial_signals) keys.push(...Object.keys(user.financial_signals));
    conclusion.evidence_signals = keys.slice(0,6);
  }
  return conclusion;
}

function processFile() {
  const lines = fs.readFileSync(path.resolve(inPath), 'utf8').split(/\r?\n/).filter(Boolean);
  const outLines: string[] = [];
  lines.forEach((ln, idx) => {
    try {
      const obj = JSON.parse(ln);
      const messages = obj.messages ?? [];
      const userMsg = messages.find((m:any)=>m.role==='user');
      const assistantMsg = messages.find((m:any)=>m.role==='assistant');
      const user = userMsg ? safeParse(userMsg.content as string) : {};
      const assistant = assistantMsg ? safeParse(assistantMsg.content as string) : {};
      const conclusion = mapAssistantToConclusion(assistant, user, idx+1);
      const out = { messages: [ { role: 'system', content: 'output only JSON matching conclusion_v1' }, { role: 'user', content: JSON.stringify(user) }, { role: 'assistant', content: JSON.stringify(conclusion) } ] };
      outLines.push(JSON.stringify(out));
    } catch (e) {
      // skip
    }
  });
  fs.writeFileSync(path.resolve(outPath), outLines.join('\n') + '\n');
  console.log(`wrote ${outLines.length} examples to ${outPath}`);
}

processFile();
