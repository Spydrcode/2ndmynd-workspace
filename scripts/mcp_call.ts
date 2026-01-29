import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Args = {
  tool?: string;
  args?: string;
  serverCmd: string;
  serverArgs: string[];
  cwd?: string;
};

const DEFAULTS: Args = {
  serverCmd: "npm",
  serverArgs: ["run", "mcp:server", "--"],
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--tool":
        args.tool = value;
        break;
      case "--args":
        args.args = value;
        break;
      case "--server_cmd":
        if (value) args.serverCmd = value;
        break;
      case "--server_args":
        if (value) {
          args.serverArgs = value.split(" ").filter(Boolean);
        }
        break;
      case "--cwd":
        args.cwd = value;
        break;
      default:
        break;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tool) {
    console.error("Missing --tool <name>.");
    process.exit(1);
  }

  const toolArgs = args.args ? (JSON.parse(args.args) as Record<string, unknown>) : {};
  const transport = new StdioClientTransport({
    command: args.serverCmd,
    args: args.serverArgs,
    cwd: args.cwd,
  });

  const client = new Client({ name: "2ndmynd-mcp-call", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  const result = await client.callTool({
    name: args.tool,
    arguments: toolArgs,
  });

  console.log(JSON.stringify(result, null, 2));
  await client.close();
}

main().catch((error) => {
  console.error("MCP call failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
