import fs from 'fs';
const src = 'data/fine_tune/train_v2.jsonl';
const dst = 'data/fine_tune/train_v2.singleline.jsonl';
if (!fs.existsSync(src)) { console.error('missing', src); process.exit(2); }
const raw = fs.readFileSync(src,'utf8');
// Use a simple brace-depth parser to split top-level JSON objects even when they contain newlines
const out = [];
let buf = '';
let depth = 0;
let inString = false;
let escape = false;
for (let i = 0; i < raw.length; i++) {
  const ch = raw[i];
  buf += ch;
  if (escape) { escape = false; continue; }
  if (ch === '\\') { escape = true; continue; }
  if (ch === '"') { inString = !inString; continue; }
  if (inString) continue;
  if (ch === '{') depth++;
  if (ch === '}') depth--;
  if (depth === 0 && buf.trim()) {
    const candidate = buf.trim();
    try {
      const obj = JSON.parse(candidate);
      out.push(JSON.stringify(obj));
      buf = '';
    } catch (e) {
      console.error('Failed to parse object ending at pos', i);
      console.error(candidate.slice(0,400));
      process.exit(4);
    }
  }
}
if (buf.trim()) {
  console.error('Trailing data after last object');
  process.exit(5);
}
fs.writeFileSync(dst, out.join('\n') + '\n');
console.log('Wrote', dst, 'lines=', out.length);
