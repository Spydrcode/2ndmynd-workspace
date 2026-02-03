import fs from "node:fs";
import path from "node:path";
import { runLoggedCompletion } from "../ml/logging/llm_client";

async function run() {
  if (!process.env.OPENAI_API_KEY) {
    process.env.ML_LOG_USE_MOCK = "1";
  }
  const result = await runLoggedCompletion({
    system_prompt: "2ndmynd CIS smoketest",
    user_context: { workspace_id: "smoketest" },
    messages: [
      { role: "system", content: "Return a short JSON object with a next_step field." },
      { role: "user", content: "Summarize the next step." },
    ],
  });

  if (!result.record) {
    throw new Error("No log record returned from runLoggedCompletion.");
  }
  const logDir = process.env.ML_LOG_DIR ?? path.join(process.cwd(), "ml", "logs");
  const dateKey = result.record.timestamp.slice(0, 10);
  const logPath = path.join(logDir, `${dateKey}.jsonl`);
  if (!fs.existsSync(logPath)) {
    throw new Error(`Expected log file not found: ${logPath}`);
  }
  console.log(JSON.stringify({ ok: true, logPath }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
