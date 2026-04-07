import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_SERVER_NAME = "gbrain";

function readPluginString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveDefaultBinaryPath() {
  const candidate = path.join(os.homedir(), ".local", "bin", "gbrain");
  return existsSync(candidate) ? candidate : "gbrain";
}

export function resolveManagedMcpServer(pluginConfig = {}) {
  const binaryPath = readPluginString(pluginConfig.binaryPath) ?? resolveDefaultBinaryPath();
  const dbPath = readPluginString(pluginConfig.dbPath) ?? path.join(os.homedir(), ".openclaw", "brain.db");

  return {
    serverName: DEFAULT_SERVER_NAME,
    server: {
      command: binaryPath,
      args: ["serve", "--db", dbPath],
    },
  };
}

export function shouldProvisionManagedMcpServer(existingServer) {
  return existingServer == null;
}

export async function ensureManagedMcpServer(api) {
  const { serverName, server } = resolveManagedMcpServer(api.pluginConfig);
  const cfg = api.runtime.config.loadConfig();
  const existingServer = cfg.mcp?.servers?.[serverName];

  if (!shouldProvisionManagedMcpServer(existingServer)) {
    return;
  }

  const next = structuredClone(cfg);
  next.mcp ??= {};
  next.mcp.servers ??= {};
  next.mcp.servers[serverName] = server;

  await api.runtime.config.writeConfigFile(next);
  api.logger.info(`gbrain plugin: provisioned mcp.servers.${serverName}`);
}
