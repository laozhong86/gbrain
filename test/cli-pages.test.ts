import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gbrain-cli-"));
  cleanup.push(dir);
  return dir;
}

function runCli(args: string[], cwd = process.cwd()) {
  return Bun.spawnSync(["bun", "run", "src/cli.ts", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
}

function decode(output: Uint8Array<ArrayBufferLike>): string {
  return new TextDecoder().decode(output);
}

describe("CLI page commands", () => {
  it("initializes a brain, writes a page, and reads it back", () => {
    const dir = createTempDir();
    const dbPath = join(dir, "brain.db");
    const pagePath = join(dir, "page.md");

    writeFileSync(
      pagePath,
      `---
title: River AI
type: company
tags:
  - ai
---

# River AI

## State

Builds agent software.

---

- **2026-04-05** | note — Raised a new round.
`,
    );

    const initResult = runCli(["init", "--db", dbPath]);
    const putResult = runCli(["put", "river-ai", "--db", dbPath, pagePath]);
    const getResult = runCli(["get", "river-ai", "--db", dbPath]);
    const listResult = runCli(["list", "--db", dbPath]);
    const statsResult = runCli(["stats", "--db", dbPath]);

    expect(initResult.exitCode).toBe(0);
    expect(putResult.exitCode).toBe(0);
    expect(getResult.exitCode).toBe(0);
    expect(listResult.exitCode).toBe(0);
    expect(statsResult.exitCode).toBe(0);

    expect(decode(getResult.stdout)).toContain("# River AI");
    expect(decode(getResult.stdout)).toContain("- **2026-04-05** | note");
    expect(decode(listResult.stdout)).toContain("river-ai | company | River AI");
    expect(decode(statsResult.stdout)).toContain("Pages: 1");
  });

  it("fails when requesting a page that does not exist", () => {
    const dir = createTempDir();
    const dbPath = join(dir, "brain.db");

    const initResult = runCli(["init", "--db", dbPath]);
    const getResult = runCli(["get", "missing-page", "--db", dbPath]);

    expect(initResult.exitCode).toBe(0);
    expect(getResult.exitCode).toBe(1);
    expect(decode(getResult.stderr)).toContain("Page not found: missing-page");
  });
});
