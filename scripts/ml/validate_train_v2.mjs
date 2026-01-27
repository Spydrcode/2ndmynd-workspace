import fs from 'fs';
import readline from 'readline';

const path = 'data/fine_tune/train_v2.jsonl';
const banned = ['dashboard','dashboards','kpi','kpis','analytics','monitoring','bi'];
const requiredAssistantKeys = ['summary','core_constraint','top_patterns','what_does_not_need_to_change','recommended_builds_or_changes','questions_to_confirm','confidence'];

async function validate() {
  if (!fs.existsSync(path)) {
    console.error('file not found:', path);
    process.exit(2);
  }
  const rl = readline.createInterface({ input: fs.createReadStream(path), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      console.error('Line', lineNo, 'invalid JSON');
      process.exit(3);
    }
    if (!Array.isArray(obj.messages)) {
      console.error('Line', lineNo, 'missing messages array');
      process.exit(4);
    }
    for (const m of obj.messages) {
      if (!m.role || !m.content || typeof m.content !== 'string') {
        console.error('Line', lineNo, 'message missing role or content');
        process.exit(5);
      }
      if (!['system','user','assistant'].includes(m.role)) {
        console.error('Line', lineNo, 'invalid role:', m.role);
        process.exit(6);
      }
    }
    const assistant = obj.messages.find(m => m.role === 'assistant');
    if (!assistant) {
      console.error('Line', lineNo, 'missing assistant message');
      process.exit(7);
    }
    let ast;
    try {
      ast = JSON.parse(assistant.content);
    } catch (e) {
      console.error('Line', lineNo, 'assistant content is not valid JSON');
      process.exit(8);
    }
    for (const k of requiredAssistantKeys) {
      if (!(k in ast)) {
        console.error('Line', lineNo, 'assistant output missing key:', k);
        process.exit(9);
      }
    }
    // banned words check in assistant content string (lowercase)
    // banned words should match whole tokens to avoid accidental substring matches
    const lc = assistant.content.toLowerCase();
    for (const b of banned) {
      const re = new RegExp('\\b' + b.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i');
      if (re.test(lc)) {
        console.error('Line', lineNo, 'contains banned word:', b);
        process.exit(10);
      }
    }
  }
  console.log('Validation passed for', path);
}

validate().catch(err => { console.error('Unexpected error', err); process.exit(99); });
