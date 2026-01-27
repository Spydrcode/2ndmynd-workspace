import fs from 'fs';

const path = 'tmp/train_v2_uploaded.jsonl';
if (!fs.existsSync(path)) {
  console.error('Missing uploaded file:', path);
  process.exit(2);
}

const required = [
  'summary',
  'core_constraint',
  'top_patterns',
  'what_does_not_need_to_change',
  'recommended_builds_or_changes',
  'questions_to_confirm',
  'confidence',
];

function hasControlChars(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) return true;
  }
  return false;
}

const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
let bad = [];
let total = 0;
for (let i = 0; i < lines.length; i++) {
  const ln = i + 1;
  const raw = lines[i];
  if (!raw.trim()) continue;
  total++;
  try {
    const obj = JSON.parse(raw);
    if (!Array.isArray(obj.messages)) throw new Error('messages not array');
    const assistant = obj.messages.find(m => m.role === 'assistant');
    if (!assistant) throw new Error('missing assistant message');
    if (typeof assistant.content !== 'string') throw new Error('assistant.content not string');
    const cont = assistant.content.trim();
    // ensure assistant.content is strict JSON
    if (!cont.startsWith('{') || !cont.endsWith('}')) throw new Error('assistant.content not wrapped by { }');
    if (hasControlChars(assistant.content)) throw new Error('contains disallowed control chars');
    // ban fences and links
    if (assistant.content.includes('```')) throw new Error('contains markdown fence ```');
    if (assistant.content.includes('](') || assistant.content.includes('http://') || assistant.content.includes('https://')) throw new Error('contains link or markdown link');
    // parse inner JSON
    let parsed;
    try {
      parsed = JSON.parse(assistant.content);
    } catch (e) {
      throw new Error('assistant.content not valid JSON');
    }
    for (const k of required) {
      if (!(k in parsed)) throw new Error('assistant JSON missing key: ' + k);
    }
    const conf = parsed.confidence;
    if (!['low','med','high'].includes(conf)) throw new Error('confidence must be low|med|high');
    if (!Array.isArray(parsed.top_patterns)) throw new Error('top_patterns must be array');
    if (!Array.isArray(parsed.recommended_builds_or_changes)) throw new Error('recommended_builds_or_changes must be array');
    if (!Array.isArray(parsed.what_does_not_need_to_change)) throw new Error('what_does_not_need_to_change must be array');
    if (!Array.isArray(parsed.questions_to_confirm)) throw new Error('questions_to_confirm must be array');
  } catch (err) {
    bad.push({ line: ln, reason: err.message, preview: raw.slice(0,200) });
  }
}

const summary = { total_lines: total, bad_lines: bad.length };
console.log(JSON.stringify(summary, null, 2));
if (bad.length) {
  for (const b of bad) {
    console.error('LINE', b.line, b.reason, b.preview);
  }
  process.exit(1);
}
process.exit(0);
