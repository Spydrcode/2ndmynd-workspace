import fs from 'fs';
import path from 'path';

const src = 'data/fine_tune/train_v2_repaired.jsonl';
const dest = 'data/fine_tune/train_v2_mini.jsonl';
const maxExamples = 30;

if (!fs.existsSync(src)) {
  console.error('Missing source file:', src);
  process.exit(1);
}

const raw = fs.readFileSync(src, 'utf8');
const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
const selected = lines.slice(0, maxExamples);

const outDir = path.dirname(dest);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outText = selected.join('\n') + (selected.length ? '\n' : '');
fs.writeFileSync(dest, outText);

const size = fs.statSync(dest).size;
console.log('examples_written:', selected.length);
console.log('byte_size:', size);
console.log('output:', dest);
