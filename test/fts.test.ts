import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrainDatabase } from "../src/core/db";
import { normalizeFtsQuery, searchFTS } from "../src/core/fts";

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

describe("searchFTS", () => {
  it("returns ranked pages from the FTS index", () => {
    const dir = createTempDir("gbrain-fts-");
    const brain = new BrainDatabase(join(dir, "brain.db"));

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "companies/river-ai",
        type: "company",
        title: "River AI",
        compiledTruth: "# River AI\n\n## State\n\nRiver AI builds agent infrastructure.",
        timeline: "",
        frontmatter: JSON.stringify({ title: "River AI", type: "company" }),
      });
      brain.upsertPage({
        slug: "concepts/notes",
        type: "concept",
        title: "Notes",
        compiledTruth: "General product notes without the target term.",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Notes", type: "concept" }),
      });

      const results = searchFTS(brain.db, "agent");

      expect(results[0]?.slug).toBe("companies/river-ai");
      expect(results[0]?.score).toBeGreaterThan(0);
      expect(results[0]?.excerpt).toContain("[agent]");
    } finally {
      brain.close();
    }
  });

  it("normalizes punctuation-heavy free text before querying FTS", () => {
    const dir = createTempDir("gbrain-fts-normalized-");
    const brain = new BrainDatabase(join(dir, "brain.db"));

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "concepts/foo-bar",
        type: "concept",
        title: "Foo Bar",
        compiledTruth: "C guide for foo bar and baz workflows.",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Foo Bar", type: "concept" }),
      });

      expect(normalizeFtsQuery('C++ foo-bar foo/bar "baz')).toBe(
        '"C" AND "foo" AND "bar" AND "foo" AND "bar" AND "baz"',
      );
      expect(() => searchFTS(brain.db, "C++")).not.toThrow();
      expect(() => searchFTS(brain.db, "foo-bar")).not.toThrow();
      expect(() => searchFTS(brain.db, "foo/bar")).not.toThrow();
      expect(() => searchFTS(brain.db, '"baz')).not.toThrow();

      expect(searchFTS(brain.db, "foo-bar")[0]?.slug).toBe("concepts/foo-bar");
      expect(searchFTS(brain.db, "foo/bar")[0]?.slug).toBe("concepts/foo-bar");
    } finally {
      brain.close();
    }
  });

  it("uses title excerpts for title-only matches", () => {
    const dir = createTempDir("gbrain-fts-title-");
    const brain = new BrainDatabase(join(dir, "brain.db"));

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "companies/river-ai",
        type: "company",
        title: "River AI",
        compiledTruth: "General company description without the title term.",
        timeline: "",
        frontmatter: JSON.stringify({ title: "River AI", type: "company" }),
      });

      const results = searchFTS(brain.db, "river");

      expect(results[0]?.slug).toBe("companies/river-ai");
      expect(results[0]?.excerpt).toContain("[River]");
    } finally {
      brain.close();
    }
  });

  it("uses timeline excerpts for timeline-only matches", () => {
    const dir = createTempDir("gbrain-fts-timeline-");
    const brain = new BrainDatabase(join(dir, "brain.db"));

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "people/ali-partovi",
        type: "person",
        title: "Ali Partovi",
        compiledTruth: "Overview without the event keyword.",
        timeline: "- **2026-04-05** | meeting - Discussed moonshot pipeline.",
        frontmatter: JSON.stringify({ title: "Ali Partovi", type: "person" }),
      });

      const results = searchFTS(brain.db, "moonshot");

      expect(results[0]?.slug).toBe("people/ali-partovi");
      expect(results[0]?.excerpt).toContain("[moonshot]");
    } finally {
      brain.close();
    }
  });
});

describe("CLI search command", () => {
  it("prints formatted FTS results", () => {
    const dir = createTempDir("gbrain-search-cli-");
    const dbPath = join(dir, "brain.db");
    const pagePath = join(dir, "page.md");

    writeFileSync(
      pagePath,
      `---
title: River AI
type: company
---

# River AI

## State

Builds agent infrastructure for developer tools.
`,
    );

    expect(runCli(["init", "--db", dbPath]).exitCode).toBe(0);
    expect(runCli(["put", "companies/river-ai", "--db", dbPath, pagePath]).exitCode).toBe(0);

    const result = runCli(["search", "agent infrastructure", "--db", dbPath]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("companies/river-ai (score:");
    expect(stdout).toContain("[agent] [infrastructure]");
  });
});
