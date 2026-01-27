import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const fileId = "file-Fh4i3scVEG3VQdBLLK7w9j";

const res = await client.files.content(fileId);
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync("train.jsonl", buf);
console.log("Saved train.jsonl", buf.length, "bytes");
