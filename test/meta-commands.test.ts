import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gbrain-meta-"));
  cleanup.push(dir);
  return dir;
}

function runCli(args: string[], input?: string) {
  return Bun.spawnSync(["bun", "run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    stdin: input === undefined ? "ignore" : Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
  });
}

function decode(output: Uint8Array<ArrayBufferLike>): string {
  return new TextDecoder().decode(output);
}

describe("meta commands", () => {
  it("prints tool discovery JSON", () => {
    const result = runCli(["--tools-json"]);
    const output = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output).toContain('"brain_get"');
    expect(output).toContain('"brain_stats"');
  });

  it("prints the package version", () => {
    const result = runCli(["version"]);

    expect(result.exitCode).toBe(0);
    expect(decode(result.stdout).trim()).toBe("0.1.0");
  });

  it("reads and writes config values", () => {
    const dir = createTempDir();
    const dbPath = join(dir, "brain.db");

    expect(runCli(["init", "--db", dbPath]).exitCode).toBe(0);

    const setResult = runCli(["config", "set", "embedding_model", "local-embed", "--db", dbPath]);
    const getResult = runCli(["config", "embedding_model", "--db", dbPath]);
    const missingResult = runCli(["config", "missing_key", "--db", dbPath]);

    expect(setResult.exitCode).toBe(0);
    expect(decode(setResult.stdout).trim()).toBe("embedding_model=local-embed");
    expect(getResult.exitCode).toBe(0);
    expect(decode(getResult.stdout).trim()).toBe("local-embed");
    expect(missingResult.exitCode).toBe(0);
    expect(decode(missingResult.stdout).trim()).toBe("");
  });

  it("processes JSONL pipe requests and reports per-line errors", () => {
    const dir = createTempDir();
    const dbPath = join(dir, "brain.db");

    expect(runCli(["init", "--db", dbPath]).exitCode).toBe(0);

    const result = runCli(
      ["pipe", "--db", dbPath],
      [
        JSON.stringify({ tool: "brain_stats", input: {} }),
        JSON.stringify({ tool: "brain_stats", input: [] }),
      ].join("\n"),
    );

    const lines = decode(result.stdout).trim().split("\n").map((line) => JSON.parse(line));

    expect(result.exitCode).toBe(0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ ok: true, result: "Pages: 0" });
    expect(lines[1]).toEqual({
      ok: false,
      error: "Pipe request input must be a JSON object",
    });
  });
});
