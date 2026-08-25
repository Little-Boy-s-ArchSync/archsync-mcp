import { McpServer } from "@modelcontextprotocol/server";

import { createToolExecutor, toToolError, toToolResult } from "./adapter.mjs";
import { protocolVersion, toolDefinitions, tools } from "./contracts.mjs";

export function createToolCallback(execute, tool) {
  return async (arguments_) => {
    try {
      return toToolResult(await execute(tool, arguments_));
    } catch (error) {
      return toToolError(error);
    }
  };
}

export function createArchSyncMcpServer(options) {
  const execute = createToolExecutor(options);
  const server = new McpServer({ name: "archsync-mcp", version: "0.1.0-preparatory" }, {
    supportedProtocolVersions: [protocolVersion],
    capabilities: { tools: {} },
    instructions: "ArchSync tools delegate to versioned Core/Guardian contracts. Evolution proposals always require separate human review.",
    cacheHints: {
      "server/discover": { ttlMs: 300_000, cacheScope: "private" },
      "tools/list": { ttlMs: 300_000, cacheScope: "private" },
    },
  });

  for (const tool of tools) {
    const definition = toolDefinitions[tool];
    server.registerTool(tool, {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: tool === "architecture_explain_finding",
      },
    }, createToolCallback(execute, tool));
  }
  return server;
}
