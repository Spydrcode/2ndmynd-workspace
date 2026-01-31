import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { listTools, callTool, compileSchemasSelfTest } from "./tool_registry";

function shouldSelfTest(argv: string[]) {
  if (process.env.MCP_SELFTEST === "1") return true;
  return argv.some((arg) => arg === "--selftest" || arg.startsWith("--selftest="));
}

const server = new Server(
  { name: "2ndmynd-decision-v2", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  const result = await callTool(request.params.name, args);
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
    try {
      compileSchemasSelfTest();
      listTools().forEach((tool) => {
        console.log(tool.name);
      });
      return;
    } catch (error) {
      console.error("MCP selftest failed.");
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP server failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
