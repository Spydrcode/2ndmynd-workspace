import fs from "node:fs";
import path from "node:path";

import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";

const BUCKET = "uploads";

function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function ensureBucket() {
  const supabase = createSupabaseAdminClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.name === BUCKET);
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

export async function storeUploads(params: {
  workspace_id: string;
  run_id: string;
  files: Array<{ filename: string; buffer: Buffer }>;
}) {
  if (!hasSupabaseConfig()) {
    const baseDir = path.resolve("uploads", params.workspace_id, params.run_id);
    fs.mkdirSync(baseDir, { recursive: true });
    const paths: string[] = [];
    for (const file of params.files) {
      const safeName = path.basename(file.filename);
      const filepath = path.join(baseDir, safeName);
      fs.writeFileSync(filepath, file.buffer);
      paths.push(filepath);
    }
    return paths;
  }

  await ensureBucket();
  const supabase = createSupabaseAdminClient();
  const paths: string[] = [];
  for (const file of params.files) {
    const safeName = path.basename(file.filename);
    const storagePath = `${params.workspace_id}/${params.run_id}/${safeName}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, { upsert: true, contentType: "application/octet-stream" });
    if (error) throw error;
    paths.push(storagePath);
  }
  return paths;
}
