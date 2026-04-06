import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";

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
    expect(decode(result.stdout).trim()).toBe(pkg.version);
  });

  it("reads and writes config values", () => {
    const dir = createTempDir();
    const dbPath = join(dir, "brain.db");

    expect(runCli(["init", "--db", dbPath]).exitCode).toBe(0);

    const setResult = runCli(["config", "set", "embedding_model", "local-embed", "--db", dbPath]);
    const getResult = runCli(["config", "embedding_model", "--db", dbPath]);
    const invalidResult = runCli(["config", "version", "--db", dbPath]);
    const missingResult = runCli(["config", "set", "unknown_key", "value", "--db", dbPath]);

    expect(setResult.exitCode).toBe(0);
    expect(decode(setResult.stdout).trim()).toBe("embedding_model=local-embed");
    expect(getResult.exitCode).toBe(0);
    expect(decode(getResult.stdout).trim()).toBe("local-embed");
    expect(invalidResult.exitCode).toBe(1);
    expect(decode(invalidResult.stderr)).toContain("Unsupported config key: version");
    expect(missingResult.exitCode).toBe(1);
    expect(decode(missingResult.stderr)).toContain("Unsupported config key: unknown_key");
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

    expect(result.exitCode).toBe(1);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ ok: true, result: "Pages: 0" });
    expect(lines[1]).toEqual({
      ok: false,
      error: "Pipe request input must be a JSON object",
    });
  });

  it("supports the documented CLI flag contracts", () => {
    const dir = createTempDir();
    const dbPath = join(dir, "custom.db");
    const exportDir = join(dir, "out");
    const ingestPath = join(dir, "meeting.txt");
    writeFileSync(ingestPath, "Customer call notes");

    expect(runCli(["init", dbPath]).exitCode).toBe(0);

    const putResult = runCli(
      ["put", "people/pedro-franceschi", "--db", dbPath],
      `---
title: Pedro Franceschi
type: person
tags:
  - founder
---

# Pedro Franceschi
`,
    );
    const listResult = runCli(["list", "--type", "person", "--limit", "1", "--db", dbPath]);
    const timelineAddResult = runCli(
      [
        "timeline-add",
        "people/pedro-franceschi",
        "--date",
        "2026-04-05",
        "--summary",
        "Met in SF",
        "--source",
        "meeting",
        "--detail",
        "Shared Brex update",
        "--db",
        dbPath,
      ],
    );
    const timelineResult = runCli(["timeline", "people/pedro-franceschi", "--db", dbPath]);
    const ingestResult = runCli(["ingest", ingestPath, "--type", "meeting", "--db", dbPath]);
    const exportResult = runCli(["export", "--dir", exportDir, "--db", dbPath]);

    expect(putResult.exitCode).toBe(0);
    expect(listResult.exitCode).toBe(0);
    expect(timelineAddResult.exitCode).toBe(0);
    expect(timelineResult.exitCode).toBe(0);
    expect(ingestResult.exitCode).toBe(0);
    expect(exportResult.exitCode).toBe(0);
    expect(decode(listResult.stdout).trim()).toBe("people/pedro-franceschi | person | Pedro Franceschi");
    expect(decode(timelineResult.stdout)).toContain("2026-04-05 | meeting | Met in SF | Shared Brex update");
    expect(decode(ingestResult.stdout)).toContain(`Ingested ${ingestPath}`);
    expect(existsSync(join(exportDir, "people", "pedro-franceschi.md"))).toBe(true);
    expect(readFileSync(join(exportDir, "log.md"), "utf8")).toContain("Ingested");
  });
});
