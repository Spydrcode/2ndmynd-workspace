import fs from 'fs';

const src = 'tmp/train_v2_uploaded.jsonl';
const out = 'tmp/train_v2_repaired.jsonl';
const quarantined = 'tmp/train_v2_quarantined.jsonl';

if (!fs.existsSync(src)) {
  console.error('Missing', src);
  process.exit(2);
}

function stripFences(s) {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

function stripTrailingLink(s) {
  return s.replace(/\]\(https?:\/\/[^)]+\)\s*$/i, '');
}

function extractFirstJson(s) {
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return s.slice(first, last + 1);
}

const lines = fs.readFileSync(src,'utf8').split(/\r?\n/);
const good = [];
const unrepairable = [];
let repaired_count = 0;

for (let i=0;i<lines.length;i++){
  const ln = i+1;
  const raw = lines[i];
  if (!raw.trim()) continue;
  let obj;
  try { obj = JSON.parse(raw); } catch(e) { unrepairable.push({ln,preview:raw.slice(0,200)}); continue; }
  const assistant = obj.messages && obj.messages.find(m=>m.role==='assistant');
  if (!assistant || typeof assistant.content !== 'string') { unrepairable.push({ln,preview:raw.slice(0,200)}); continue; }
  let s = assistant.content;
  // sanitizer steps
  s = stripFences(s);
  s = stripTrailingLink(s);
  s = s.trim();
  // extract first JSON object
  const candidate = extractFirstJson(s) || s;
  try {
    const parsed = JSON.parse(candidate);
    // verify required keys exist
    const required = ['summary','core_constraint','top_patterns','what_does_not_need_to_change','recommended_builds_or_changes','questions_to_confirm','confidence'];
    let ok = true;
    for (const k of required) if (!(k in parsed)) ok = false;
    if (!ok) { unrepairable.push({ln,preview:raw.slice(0,200)}); continue; }
    assistant.content = JSON.stringify(parsed);
    good.push(JSON.stringify(obj));
    repaired_count++;
  } catch (e) {
    unrepairable.push({ln,preview:raw.slice(0,200)});
  }
}

fs.writeFileSync(out, good.join('\n') + '\n');
console.log('repaired_count=', repaired_count);
if (unrepairable.length) {
  fs.writeFileSync(quarantined, good.join('\n') + '\n');
  console.error('unrepairable lines:', unrepairable.map(x=>x.ln).join(','));
  console.error('wrote quarantined good lines to', quarantined, 'dropped', unrepairable.length);
  process.exit(1);
}
console.log('All lines repaired and written to', out);
process.exit(0);
