import { createClient } from '@supabase/supabase-js';
require('dotenv').config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE envs');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const id = process.argv[2];
if (!id) { console.error('Usage: tsx scripts/ml/print_example.ts <example_id>'); process.exit(2); }

async function main() {
  const { data, error } = await supabase.schema('ml').from('examples').select('id,input_snapshot').eq('id', id).maybeSingle();
  if (error) { console.error(error); process.exit(1); }
  if (!data) { console.error('Not found'); process.exit(1); }
  console.log(JSON.stringify(data.input_snapshot, null, 2));
}

main().catch((e)=>{ console.error(e); process.exit(1); });
