import fs from "fs";

const lines = fs.readFileSync("train.jsonl", "utf8")
  .split(/\r?\n/)
  .filter(Boolean);

let bad = 0;
let hugeLine = 0;
let hugeMsg = 0;
let missingAssistant = 0;
let badRole = 0;
let nonString = 0;
let controlChars = 0;

function hasControlChars(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) return true;
  }
  return false;
}

const HUGE_LINE = 200_000;
const HUGE_MSG = 20_000;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.length > HUGE_LINE) {
    hugeLine++;
    if (hugeLine <= 5) console.log("HUGE LINE", i + 1, "len=", line.length);
  }

  let obj;
  try {
    obj = JSON.parse(line);
  } catch (e) {
    bad++;
    if (bad <= 10) console.log("BAD JSON", i + 1, e.message);
    continue;
  }

  if (!obj.messages || !Array.isArray(obj.messages)) {
    bad++;
    if (bad <= 10) console.log("BAD SHAPE", i + 1, "missing messages[]");
    continue;
  }

  let sawAssistant = false;

  for (const m of obj.messages) {
    if (!m || typeof m !== "object") { bad++; continue; }

    const role = m.role;
    const content = m.content;

    if (!["system", "user", "assistant"].includes(role)) {
      badRole++;
      if (badRole <= 10) console.log("BAD ROLE", i + 1, role);
    }

    if (typeof content !== "string") {
      nonString++;
      if (nonString <= 10) console.log("NON-STRING content", i + 1, typeof content);
      continue;
    }

    if (content.length > HUGE_MSG) {
      hugeMsg++;
      if (hugeMsg <= 5) console.log("HUGE MSG", i + 1, "role=", role, "len=", content.length);
    }

    if (hasControlChars(content)) {
      controlChars++;
      if (controlChars <= 10) console.log("CONTROL CHARS", i + 1, "role=", role);
    }

    if (role === "assistant" && content.trim().length) sawAssistant = true;
  }

  if (!sawAssistant) {
    missingAssistant++;
    if (missingAssistant <= 10) console.log("MISSING ASSISTANT", i + 1);
  }
}

console.log({
  total_lines: lines.length,
  bad,
  hugeLine,
  hugeMsg,
  missingAssistant,
  badRole,
  nonString,
  controlChars
});
