import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
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
    const putResult = runCli(["put", "companies/river-ai", "--db", dbPath, pagePath]);
    const getResult = runCli(["get", "companies/river-ai", "--db", dbPath]);
    const listResult = runCli(["list", "--db", dbPath]);
    const taggedListResult = runCli(["list", "--tag", "ai", "--db", dbPath]);
    const statsResult = runCli(["stats", "--db", dbPath]);

    expect(initResult.exitCode).toBe(0);
    expect(putResult.exitCode).toBe(0);
    expect(getResult.exitCode).toBe(0);
    expect(listResult.exitCode).toBe(0);
    expect(taggedListResult.exitCode).toBe(0);
    expect(statsResult.exitCode).toBe(0);

    expect(decode(getResult.stdout)).toContain("# River AI");
    expect(decode(getResult.stdout)).toContain("- **2026-04-05** | note");
    expect(decode(listResult.stdout)).toContain("companies/river-ai | company | River AI");
    expect(decode(taggedListResult.stdout)).toContain("companies/river-ai | company | River AI");
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

  it("writes tags and filters list output by tag", () => {
    const dir = createTempDir();
    const dbPath = join(dir, "brain.db");
    const companyPath = join(dir, "company.md");
    const conceptPath = join(dir, "concept.md");

    writeFileSync(
      companyPath,
      `---
title: River AI
type: company
tags:
  - ai
  - infra
---

# River AI
`,
    );
    writeFileSync(
      conceptPath,
      `---
title: Hiring Loop
type: concept
tags:
  - recruiting
---

# Hiring Loop
`,
    );

    expect(runCli(["init", "--db", dbPath]).exitCode).toBe(0);
    expect(runCli(["put", "companies/river-ai", "--db", dbPath, companyPath]).exitCode).toBe(0);
    expect(runCli(["put", "concepts/hiring-loop", "--db", dbPath, conceptPath]).exitCode).toBe(0);

    const taggedListResult = runCli(["list", "--tag", "ai", "--db", dbPath]);
    const taggedOutput = decode(taggedListResult.stdout);

    expect(taggedListResult.exitCode).toBe(0);
    expect(taggedOutput).toContain("companies/river-ai | company | River AI");
    expect(taggedOutput).not.toContain("concepts/hiring-loop | concept | Hiring Loop");
  });

  it("returns a controlled error for malformed stored frontmatter", () => {
    const dir = createTempDir();
    const dbPath = join(dir, "brain.db");
    const pagePath = join(dir, "page.md");

    writeFileSync(
      pagePath,
      `---
title: River AI
type: company
---

# River AI
`,
    );

    expect(runCli(["init", "--db", dbPath]).exitCode).toBe(0);
    expect(runCli(["put", "companies/river-ai", "--db", dbPath, pagePath]).exitCode).toBe(0);

    const db = new Database(dbPath);
    db.query("UPDATE pages SET frontmatter = ? WHERE slug = ?").run("{bad json", "companies/river-ai");
    db.close();

    const getResult = runCli(["get", "companies/river-ai", "--db", dbPath]);

    expect(getResult.exitCode).toBe(1);
    expect(decode(getResult.stderr)).toContain(
      "Stored frontmatter is invalid JSON for page: companies/river-ai",
    );
  });
});
