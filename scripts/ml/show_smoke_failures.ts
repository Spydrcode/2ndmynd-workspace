import { createClient } from "@supabase/supabase-js";
require('dotenv').config();

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    args[key.replace(/^--/, "")] = value ?? "";
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE env vars');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let smoke_cycle_id = args.smoke_cycle_id;
  if (!smoke_cycle_id) {
    const { data: recent } = await supabase
      .schema('ml')
      .from('run_results')
      .select('smoke_cycle_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    smoke_cycle_id = recent?.smoke_cycle_id;
  }

  if (!smoke_cycle_id) {
    console.error('No smoke_cycle_id found');
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .schema('ml')
    .from('run_results')
    .select('run_id,example_id,model,output,scores,pass,created_at')
    .eq('smoke_cycle_id', smoke_cycle_id)
    .eq('pass', false)
    .limit(10);

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  console.log(`smoke_cycle_id: ${smoke_cycle_id}, failures: ${rows?.length ?? 0}`);
  for (const r of rows ?? []) {
    console.log('---');
    console.log(`example_id: ${r.example_id}`);
    console.log(`model: ${r.model}`);
    console.log(`pass: ${r.pass}`);
    console.log('scores:', JSON.stringify(r.scores ?? {}, null, 2));
    console.log('output.raw (truncated):', JSON.stringify((r.output as any)?.raw ?? {}, null, 2).slice(0, 800));
    console.log('output.rewritten (truncated):', JSON.stringify((r.output as any)?.rewritten ?? {}, null, 2).slice(0, 800));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
