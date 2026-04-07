import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { ensureManagedMcpServer } from "./mcp-bootstrap.js";

export default definePluginEntry({
  id: "gbrain",
  name: "GBrain",
  description: "GBrain skill pack and hook pack for OpenClaw.",
  register(api) {
    api.registerService({
      id: "gbrain-mcp-bootstrap",
      start: async () => {
        try {
          await ensureManagedMcpServer(api);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          api.logger.error(`gbrain plugin: failed to provision MCP server: ${message}`);
        }
      },
      stop: async () => {},
    });
  },
});
