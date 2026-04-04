import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const AUTHENTICATED_TOOLS_NO_APIKEY = [
  "agentid_whoami",
  "agentid_send_task",
  "agentid_check_inbox",
];

interface ToolEntry {
  inputSchema?: { _def?: { shape?: () => Record<string, unknown> } };
}

async function runSmokeTest() {
  process.env.AGENTID_API_KEY = "agk_smoke_test_key_for_testing";

  const { createServer } = await import("./index.ts");

  const server = createServer();

  const registeredTools = (
    server as unknown as { _registeredTools?: Record<string, ToolEntry> }
  )._registeredTools ?? {};

  const toolNames = Object.keys(registeredTools);
  if (toolNames.length === 0) {
    throw new Error("FAIL: No tools registered on MCP server");
  }

  for (const toolName of AUTHENTICATED_TOOLS_NO_APIKEY) {
    if (!(toolName in registeredTools)) {
      throw new Error(`FAIL: Expected tool '${toolName}' to be registered on server`);
    }

    const tool = registeredTools[toolName];
    const shapeGetter = tool?.inputSchema?._def?.shape;
    const shape = typeof shapeGetter === "function" ? shapeGetter() : {};

    if ("apiKey" in shape) {
      throw new Error(
        `FAIL: Tool '${toolName}' has 'apiKey' as an LLM-visible tool parameter. ` +
          `API keys must be sourced from AGENTID_API_KEY environment variable at server startup, ` +
          `not passed through tool parameters where they are visible to the LLM and logged.`,
      );
    }

    console.log(`PASS: '${toolName}' schema verified — no apiKey parameter`);
  }

  console.log(
    "\nPASS: All authenticated tool schemas verified — no apiKey parameter exposed to LLMs",
  );
  console.log(`      Tools checked: ${AUTHENTICATED_TOOLS_NO_APIKEY.join(", ")}`);
}

runSmokeTest().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
