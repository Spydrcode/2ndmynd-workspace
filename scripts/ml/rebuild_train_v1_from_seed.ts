import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "child_process";
import fs from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (SUPABASE_URL !== "http://127.0.0.1:54331") {
  console.error(`SUPABASE_URL must be http://127.0.0.1:54331, got ${SUPABASE_URL}`);
  process.exit(1);
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const quotesPath = "./seed/jobber/Quotes.csv";
const invoicesPath = "./seed/jobber/Invoices.csv";
if (!fs.existsSync(quotesPath)) {
  console.error(`Missing file: ${quotesPath}`);
  process.exit(1);
}
if (!fs.existsSync(invoicesPath)) {
  console.error(`Missing file: ${invoicesPath}`);
  process.exit(1);
}
function runScript(cmd: string) {
  const result = spawnSync(cmd, { shell: true, stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`Failed: ${cmd}`);
    process.exit(result.status ?? 1);
  }
}
runScript("npm run seed:jobber");
runScript("npm run ml:export-drafts");
runScript("npm run ml:autofill-drafts");
runScript("npm run ml:finalize-train");
runScript("npm run ml:diag-examples --in ./ml_review/drafts.json");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
(async () => {
  const { data: dataset, error } = await supabase.schema("ml").from("datasets").select("example_ids").eq("name", "train_v1").single();
  if (error || !dataset || !dataset.example_ids || dataset.example_ids.length !== 10) {
    console.error(`train_v1 example_ids length mismatch: ${dataset?.example_ids?.length ?? 0}`);
    process.exit(1);
  }
  const { data: examples, error: exErr } = await supabase.schema("ml").from("examples").select("id").in("id", dataset.example_ids);
  if (exErr || !examples || examples.length !== 10) {
    console.error(`examples found mismatch: ${examples?.length ?? 0}`);
    process.exit(1);
  }
  console.log("rebuild complete");
  console.log("train_v1 example_ids: 10");
  console.log("examples found: 10");
  console.log("ready for export-jsonl");
})();
