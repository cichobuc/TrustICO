import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "trustico",
    version: "1.0.0",
  });

  // Tools will be registered here in subsequent phases

  return server;
}
