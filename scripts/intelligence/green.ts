import process from "node:process";

import { compileSchemasSelfTest, listTools } from "../../mcp/tool_registry";
import { runMcpSmoke } from "../mcp_smoke";
import { runIntelligenceEval } from "./eval";

async function main() {
  process.env.INTELLIGENCE_MODE = "mock";

  compileSchemasSelfTest();
  listTools().forEach((tool) => {
    console.log(tool.name);
  });

  await runMcpSmoke([]);
  await runIntelligenceEval([]);

  console.log("Intelligence green run complete");
}

main().catch((error) => {
  console.error("Intelligence green run failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
