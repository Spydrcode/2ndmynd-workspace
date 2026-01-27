import { createClient } from "@supabase/supabase-js";
require('dotenv').config();

const JOB_ID = process.argv[2] || process.env.JOB_ID;
if (!JOB_ID) {
  console.error('Usage: tsx scripts/ml/find_run_by_jobid.ts <openai_job_id>');
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function main() {
  const { data, error } = await supabase
    .schema('ml')
    .from('runs')
    .select('id,openai_job_id,run_status,result_model')
    .eq('openai_job_id', JOB_ID)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }
  if (!data) {
    console.error('No run found for', JOB_ID);
    process.exit(1);
  }

  console.log('run id:', data.id);
  console.log('openai_job_id:', data.openai_job_id);
  console.log('status:', data.run_status);
  console.log('result_model:', data.result_model);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
