import { callTool } from "../mcp/server";

export async function runCall(dbPath: string, tool: string, payload: string): Promise<string> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Call payload must be valid JSON");
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Call payload must be a JSON object");
  }

  return callTool(dbPath, tool, parsed as Record<string, unknown>);
}
