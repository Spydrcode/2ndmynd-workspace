import { createClient } from '@supabase/supabase-js';
require('dotenv').config();

function ensureEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE env vars');
    process.exit(1);
  }
}

async function main() {
  ensureEnv();
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: examples, error } = await supabase
    .schema('ml')
    .from('examples')
    .select('id, input_snapshot')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to list examples:', error.message);
    process.exit(1);
  }

  const ids = (examples ?? []).map((e:any) => e.id);
  if (ids.length === 0) {
    console.error('No examples found to create smoke datasets');
    process.exit(1);
  }

  const clean = ids.slice(0, Math.min(6, ids.length));
  const messy = ids.slice(Math.max(6, ids.length - 4));

  const upsert = async (name: string, example_ids: string[]) => {
    const payload = {
      name,
      purpose: 'train',
      schema_version: 'snapshot_v1',
      description: `auto-created smoke dataset ${name}`,
      example_ids,
    };
    const { error: uerr } = await supabase.schema('ml').from('datasets').upsert(payload, { onConflict: 'name' });
    if (uerr) {
      console.error(`Failed to upsert dataset ${name}:`, uerr.message);
      process.exit(1);
    }
    console.log(`created dataset ${name} with ${example_ids.length} examples`);
  };

  await upsert('smoke_clean', clean);
  await upsert('smoke_messy', messy);
  console.log('done');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
