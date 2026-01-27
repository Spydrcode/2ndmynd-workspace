import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const fileId = "file-Fh4i3scVEG3VQdBLLK7w9j";

try {
  const f = await client.files.retrieve(fileId);
  console.log("FILE:", f);

  const content = await client.files.content(fileId);
  const buf = Buffer.from(await content.arrayBuffer());
  fs.writeFileSync("train.jsonl", buf);
  console.log("Saved train.jsonl");

  const lines = fs.readFileSync("train.jsonl", "utf8").split(/\r?\n/).filter(Boolean);
  let bad = 0, tooLong = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const obj = JSON.parse(line);
      if (!obj.messages || !Array.isArray(obj.messages)) throw new Error("missing messages[]");
      for (const m of obj.messages) {
        if (!["system", "user", "assistant"].includes(m.role)) throw new Error("bad role " + m.role);
        if (typeof m.content !== "string") throw new Error("content not string");
        if (!m.content.trim()) throw new Error("empty content");
        if (m.content.length > 20000) tooLong++;
      }
    } catch (e) {
      bad++;
      if (bad <= 20) console.log("BAD line", i + 1, e.message);
    }
  }
  console.log({ total: lines.length, bad, tooLong });
} catch (err) {
  console.error("ERROR:", err);
  process.exitCode = 1;
}
