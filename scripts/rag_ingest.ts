import fs from "node:fs";
import path from "node:path";
import minimist from "minimist";
import { ingestDocs, ingestFromJsonl } from "../ml/rag/ingest";

async function run() {
  const args = minimist(process.argv.slice(2));
  const workspaceId = args.workspace_id ?? "internal";
  const businessId = args.business_id;
  const source = args.source ?? "manual";

  if (args.labels === true) {
    const labelsDir = path.join(process.cwd(), "ml", "datasets", "labels");
    const files = fs.readdirSync(labelsDir).filter((file) => file.endsWith(".md"));
    const inputs = files.map((file) => ({
      id: `labels-${file.replace(/\.md$/, "")}`,
      workspace_id: workspaceId,
      business_id: businessId,
      content: fs.readFileSync(path.join(labelsDir, file), "utf-8"),
      source: `internal_doc:${file}`,
      metadata: { filename: file },
    }));
    const result = await ingestDocs(inputs);
    console.log(JSON.stringify({ ok: true, count: result.count }, null, 2));
    return;
  }

  if (!args.in) {
    throw new Error("Provide --in <jsonl path> or use --labels.");
  }

  const result = await ingestFromJsonl({
    filePath: String(args.in),
    workspace_id: String(workspaceId),
    business_id: businessId ? String(businessId) : undefined,
    source: String(source),
  });
  console.log(JSON.stringify({ ok: true, count: result.count }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
