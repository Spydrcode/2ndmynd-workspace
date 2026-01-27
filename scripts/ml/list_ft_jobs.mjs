import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
try {
  const res = await client.fineTuning.jobs.list({ limit: 100 });
  for (const j of res.data) {
    console.log(`${j.id}\t${j.status}\t${j.user_provided_suffix ?? ''}\t${j.training_file ?? ''}\t${new Date((j.created_at||0)*1000).toISOString()}`);
  }
} catch (err) {
  console.error('ERROR listing jobs:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
