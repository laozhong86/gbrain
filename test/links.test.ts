import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBacklinks, runLink, runUnlink } from "../src/commands/link";
import { runTag, runTags, runUntag } from "../src/commands/tags";
import { runPutFromSource } from "../src/commands/put";
import { BrainDatabase } from "../src/core/db";
import { extractWikiLinks, normalizeWikiTarget } from "../src/core/links";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "gbrain-links-"));
  cleanup.push(dir);
  return join(dir, "brain.db");
}

function runCli(args: string[]) {
  return Bun.spawnSync(["bun", "run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
}

function seedPage(dbPath: string, slug: string, title: string, type = "concept"): void {
  runPutFromSource(
    dbPath,
    slug,
    `---
title: ${title}
type: ${type}
---

# ${title}
`,
  );
}

describe("links", () => {
  it("extracts relative markdown links and normalizes targets", () => {
    const links = extractWikiLinks(
      "Ali invested in [River AI](../companies/river-ai.md) with [Pedro](../people/pedro-franceschi.md).",
    );

    expect(links).toHaveLength(2);
    expect(links.map((link) => link.targetSlug)).toEqual([
      "companies/river-ai",
      "people/pedro-franceschi",
    ]);
    expect(normalizeWikiTarget("../companies/river-ai.md")).toBe("companies/river-ai");
  });

  it("extracts links with multi-level relative paths", () => {
    const links = extractWikiLinks(
      "See [Acme](../../companies/acme.md) and [Ali](../../../people/ali-partovi.md).",
    );

    expect(links.map((link) => link.targetSlug)).toEqual(["companies/acme", "people/ali-partovi"]);
    expect(normalizeWikiTarget("../../companies/acme.md")).toBe("companies/acme");
  });

  it("links pages, lists backlinks, and removes links", () => {
    const dbPath = createDatabasePath();

    seedPage(dbPath, "people/ali-partovi", "Ali Partovi", "person");
    seedPage(dbPath, "companies/river-ai", "River AI", "company");

    expect(runLink(dbPath, "people/ali-partovi", "companies/river-ai", "invested")).toBe(
      "Linked people/ali-partovi -> companies/river-ai",
    );
    expect(runBacklinks(dbPath, "companies/river-ai")).toBe("people/ali-partovi");
    expect(runUnlink(dbPath, "people/ali-partovi", "companies/river-ai")).toBe(
      "Unlinked people/ali-partovi -> companies/river-ai",
    );
    expect(runBacklinks(dbPath, "companies/river-ai")).toBe("");
  });

  it("parses --context for the CLI link command and stores the context value", () => {
    const dbPath = createDatabasePath();

    seedPage(dbPath, "people/ali-partovi", "Ali Partovi", "person");
    seedPage(dbPath, "companies/river-ai", "River AI", "company");

    const result = runCli([
      "link",
      "people/ali-partovi",
      "companies/river-ai",
      "--context",
      "founder",
      "--db",
      dbPath,
    ]);

    expect(result.exitCode).toBe(0);

    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      const link = brain.db
        .query<{ context: string }, []>(
          `SELECT links.context
           FROM links
           INNER JOIN pages AS from_pages ON from_pages.id = links.from_page_id
           INNER JOIN pages AS to_pages ON to_pages.id = links.to_page_id
           WHERE from_pages.slug = 'people/ali-partovi' AND to_pages.slug = 'companies/river-ai'`,
        )
        .get();

      expect(link?.context).toBe("founder");
    } finally {
      brain.close();
    }
  });

  it("lists, adds, and removes tags without regressing stored tags", () => {
    const dbPath = createDatabasePath();

    runPutFromSource(
      dbPath,
      "companies/river-ai",
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

    expect(runTags(dbPath, "companies/river-ai")).toBe("ai\ninfra");
    expect(runTag(dbPath, "companies/river-ai", "founder")).toBe(
      "Tagged companies/river-ai with founder",
    );
    expect(runTags(dbPath, "companies/river-ai")).toBe("ai\nfounder\ninfra");
    expect(runUntag(dbPath, "companies/river-ai", "infra")).toBe(
      "Removed infra from companies/river-ai",
    );
    expect(runTags(dbPath, "companies/river-ai")).toBe("ai\nfounder");

    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      const filtered = brain.listPages({ tag: "ai" }).map((page) => page.slug);
      expect(filtered).toEqual(["companies/river-ai"]);
    } finally {
      brain.close();
    }
  });

  it("synchronizes outgoing links on put when links are added, changed, and removed", () => {
    const dbPath = createDatabasePath();

    seedPage(dbPath, "people/ali-partovi", "Ali Partovi", "person");
    seedPage(dbPath, "companies/river-ai", "River AI", "company");
    seedPage(dbPath, "companies/acme", "Acme", "company");

    runPutFromSource(
      dbPath,
      "concepts/market-map",
      `---
title: Market Map
type: concept
---

# Market Map

Mentions [River AI](../../companies/river-ai.md).
`,
    );

    expect(runBacklinks(dbPath, "companies/river-ai")).toBe("concepts/market-map");
    expect(runBacklinks(dbPath, "companies/acme")).toBe("");

    runPutFromSource(
      dbPath,
      "concepts/market-map",
      `---
title: Market Map
type: concept
---

# Market Map

Now mentions [Acme](../../companies/acme.md).
`,
    );

    expect(runBacklinks(dbPath, "companies/river-ai")).toBe("");
    expect(runBacklinks(dbPath, "companies/acme")).toBe("concepts/market-map");

    runPutFromSource(
      dbPath,
      "concepts/market-map",
      `---
title: Market Map
type: concept
---

# Market Map

No linked companies now.
`,
    );

    expect(runBacklinks(dbPath, "companies/river-ai")).toBe("");
    expect(runBacklinks(dbPath, "companies/acme")).toBe("");
  });
});
