import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import * as inferDecisionV2Tool from "./tools/infer_decision_v2";
import * as validateConclusionV2Tool from "./tools/validate_conclusion_v2";
import * as runMockPackV2Tool from "./tools/run_mock_pack_v2";
import * as runPipelineV2Tool from "./tools/run_pipeline_v2";

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

const toolRegistry = [
  { tool: inferDecisionV2Tool.tool, handler: inferDecisionV2Tool.handler as ToolHandler },
  { tool: validateConclusionV2Tool.tool, handler: validateConclusionV2Tool.handler as ToolHandler },
  { tool: runMockPackV2Tool.tool, handler: runMockPackV2Tool.handler as ToolHandler },
  { tool: runPipelineV2Tool.tool, handler: runPipelineV2Tool.handler as ToolHandler },
];

function shouldSelfTest(argv: string[]) {
  if (process.env.MCP_SELFTEST === "1") return true;
  return argv.some((arg) => arg === "--selftest" || arg.startsWith("--selftest="));
}

const server = new Server(
  { name: "2ndmynd-decision-v2", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolRegistry.map((entry) => entry.tool),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const entry = toolRegistry.find((item) => item.tool.name === toolName);
  if (!entry) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  const result = await entry.handler(args);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result),
      },
    ],
  };
});

async function main() {
  if (shouldSelfTest(process.argv.slice(2))) {
    toolRegistry.forEach((entry) => {
      console.log(entry.tool.name);
    });
    return;
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP server failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
