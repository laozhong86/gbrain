export type ManagedMcpServer = {
  serverName: string;
  server: {
    command: string;
    args: string[];
  };
};

export function resolveManagedMcpServer(pluginConfig?: Record<string, unknown>): ManagedMcpServer;
export function shouldProvisionManagedMcpServer(existingServer: unknown): boolean;
export function ensureManagedMcpServer(api: {
  pluginConfig?: Record<string, unknown>;
  runtime: {
    config: {
      loadConfig(): Record<string, unknown>;
      writeConfigFile(next: Record<string, unknown>): Promise<void>;
    };
  };
  logger: {
    info(message: string): void;
  };
}): Promise<void>;
