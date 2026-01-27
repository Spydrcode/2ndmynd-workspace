import fs from 'fs';

const fileId = process.argv[2] || 'file-RyAvpFSA4c5CgPGgghSmkt';
const outPath = 'tmp/train_v2_uploaded.jsonl';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

async function download() {
  const url = `https://api.openai.com/v1/files/${fileId}/content`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('Failed to download file:', res.status, txt.slice(0,400));
    process.exit(2);
  }

  const destDir = 'tmp';
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const fileStream = fs.createWriteStream(outPath);
  const reader = res.body.getReader();
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
    bytes += value.length;
  }
  fileStream.end();
  console.log('Wrote', outPath, bytes, 'bytes');
}

download().catch((err) => {
  console.error('Download error:', err instanceof Error ? err.message : String(err));
  process.exit(99);
});
