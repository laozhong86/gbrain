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

  it("marks the plugin package as publishable and ClawHub-compatible", () => {
    const pkg = JSON.parse(readFileSync("plugins/openclaw/package.json", "utf8"));

    expect(pkg.private).not.toBe(true);
    expect(pkg.publishConfig?.access).toBe("public");
    expect(pkg.openclaw?.install?.defaultChoice).toBe("npm");
    expect(pkg.openclaw?.install?.npmSpec).toBe("@laozhong86/gbrain-openclaw");
    expect(pkg.openclaw?.compat?.pluginApi).toBeTruthy();
    expect(pkg.openclaw?.compat?.minGatewayVersion).toBeTruthy();
    expect(pkg.openclaw?.build?.openclawVersion).toBeTruthy();
    expect(pkg.openclaw?.build?.pluginSdkVersion).toBeTruthy();
  });

  it("documents remote plugin installation without a source checkout", () => {
    const readme = readFileSync("README.md", "utf8");
    const openclawGuide = readFileSync("docs/openclaw.md", "utf8");

    expect(readme).toContain("openclaw plugins install @laozhong86/gbrain-openclaw");
    expect(openclawGuide).toContain("openclaw plugins install @laozhong86/gbrain-openclaw");
  });

  it("packs as a publishable npm tarball", () => {
    const result = Bun.spawnSync(["npm", "pack", "--json", "--dry-run"], {
      cwd: "plugins/openclaw",
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);

    const output = new TextDecoder().decode(result.stdout).trim();
    const [packResult] = JSON.parse(output) as Array<{ files?: Array<{ path?: string }> }>;
    const packedFiles = new Set((packResult?.files ?? []).map((entry) => entry.path));

    expect(packedFiles.has("package.json")).toBe(true);
    expect(packedFiles.has("README.md")).toBe(true);
    expect(packedFiles.has("openclaw.plugin.json")).toBe(true);
    expect(packedFiles.has("index.js")).toBe(true);
    expect(packedFiles.has("mcp-bootstrap.js")).toBe(true);
    expect(
      Array.from(packedFiles).some((path) => path?.startsWith("skills/gbrain-ingest/")),
    ).toBe(true);
    expect(
      Array.from(packedFiles).some((path) => path?.startsWith("hooks/gbrain-ingest-session/")),
    ).toBe(true);
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
