import { afterEach, describe, expect, it } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpgrade } from "../src/commands/upgrade";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

describe("runUpgrade", () => {
  it("reports when an update is available", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          tag_name: "v0.2.0",
          assets: [{ name: "gbrain-darwin-arm64", browser_download_url: "https://example.com/asset" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const result = await runUpgrade({
      apiUrl: "https://example.com/latest",
      assetName: "gbrain-darwin-arm64",
      checkOnly: true,
      currentVersion: "0.1.0",
      executablePath: "/tmp/gbrain-test-binary",
      fetchImpl,
    });

    expect(result).toBe("Update available: 0.1.0 -> 0.2.0");
  });

  it("replaces the executable with the downloaded asset", async () => {
    const dir = createTempDir("gbrain-upgrade-");
    const executablePath = join(dir, "gbrain");
    writeFileSync(executablePath, "old-binary");
    chmodSync(executablePath, 0o755);

    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/latest")) {
        return new Response(
          JSON.stringify({
            tag_name: "v0.2.0",
            assets: [{ name: "gbrain-darwin-arm64", browser_download_url: "https://example.com/asset" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("new-binary", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    }) as typeof fetch;

    const result = await runUpgrade({
      apiUrl: "https://example.com/latest",
      assetName: "gbrain-darwin-arm64",
      currentVersion: "0.1.0",
      executablePath,
      fetchImpl,
    });

    expect(result).toBe("Updated gbrain from 0.1.0 to 0.2.0");
    expect(existsSync(executablePath)).toBe(true);
    expect(readFileSync(executablePath, "utf8")).toBe("new-binary");
  });

  it("rejects self-update when running from bun instead of a compiled binary", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          tag_name: "v0.2.0",
          assets: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    await expect(
      runUpgrade({
        apiUrl: "https://example.com/latest",
        executablePath: "/opt/homebrew/bin/bun",
        fetchImpl,
      }),
    ).rejects.toThrow("Self-update only works when running the compiled gbrain binary");
  });
});
