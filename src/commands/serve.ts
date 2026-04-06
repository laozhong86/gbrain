import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "../mcp/server";

export async function runServe(dbPath: string): Promise<void> {
  const server = await buildServer(dbPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
