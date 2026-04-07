import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolveManagedMcpServer, shouldProvisionManagedMcpServer } from "../plugins/openclaw/mcp-bootstrap.js";

describe("OpenClaw plugin packaging", () => {
  it("declares a native plugin entry and hook pack exports", () => {
    const pkg = JSON.parse(readFileSync("plugins/openclaw/package.json", "utf8"));
    const manifest = JSON.parse(readFileSync("plugins/openclaw/openclaw.plugin.json", "utf8"));

    expect(pkg.openclaw?.extensions).toEqual(["./index.js"]);
    expect(pkg.openclaw?.hooks).toBeUndefined();
    expect(manifest.id).toBe("gbrain");
    expect(manifest.skills).toEqual(["./skills"]);
    expect(manifest.hooks).toEqual(["./hooks/gbrain-ingest-session"]);
    expect(manifest.configSchema?.type).toBe("object");
  });

  it("derives the managed MCP server from plugin config overrides", () => {
    const managed = resolveManagedMcpServer({
      binaryPath: "/tmp/gbrain",
      dbPath: "/tmp/brain.db",
    });

    expect(managed.serverName).toBe("gbrain");
    expect(managed.server.command).toBe("/tmp/gbrain");
    expect(managed.server.args).toEqual(["serve", "--db", "/tmp/brain.db"]);
  });

  it("only auto-provisions the MCP server when the entry is missing", () => {
    expect(shouldProvisionManagedMcpServer(undefined)).toBe(true);
    expect(
      shouldProvisionManagedMcpServer({
        command: "/Users/x/.local/bin/gbrain",
        args: ["serve", "--db", "/Users/x/.openclaw/brain.db"],
      }),
    ).toBe(false);
  });
});
