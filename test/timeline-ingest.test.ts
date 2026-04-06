import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIngest } from "../src/commands/ingest";
import { runGet } from "../src/commands/get";
import { runImport } from "../src/commands/import";
import { runTimelineAdd, runTimelineList } from "../src/commands/timeline";
import { BrainDatabase } from "../src/core/db";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("timeline commands", () => {
  it("adds a structured timeline entry and returns it in reverse chronological order", () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-timeline-"));
    dirs.push(dir);

    const dbPath = join(dir, "brain.db");
    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "people/pedro-franceschi",
        type: "person",
        title: "Pedro Franceschi",
        compiledTruth: "# Pedro Franceschi",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Pedro Franceschi", type: "person" }),
      });
    } finally {
      brain.close();
    }

    expect(
      runTimelineAdd(
        dbPath,
        "people/pedro-franceschi",
        "2026-04-05",
        "meeting",
        "Met in SF",
        "Shared Brex update",
      ),
    ).toBe("Added timeline entry to people/pedro-franceschi");

    const output = runTimelineList(dbPath, "people/pedro-franceschi");

    expect(output).toContain("2026-04-05");
    expect(output).toContain("Met in SF");
    expect(output).toContain("Shared Brex update");
  });

  it("imports markdown timeline entries so timeline queries can see them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-import-timeline-"));
    dirs.push(dir);

    const sourceDir = join(dir, "pages");
    mkdirSync(join(sourceDir, "people"), { recursive: true });
    writeFileSync(
      join(sourceDir, "people", "pedro-franceschi.md"),
      `---
title: Pedro Franceschi
type: person
---

# Pedro Franceschi

Notes.

---

- **2026-04-05** | meeting — Met in SF
`,
    );

    const dbPath = join(dir, "brain.db");

    await expect(runImport(dbPath, sourceDir, false)).resolves.toBe("Imported 1 pages");
    expect(runTimelineList(dbPath, "people/pedro-franceschi")).toBe("2026-04-05 | meeting | Met in SF");
    expect(runGet(dbPath, "people/pedro-franceschi")).toContain("- **2026-04-05** | meeting — Met in SF\n");
  });

  it("keeps imported timeline markdown lossless with continuation lines and hyphen separators", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-import-timeline-lossless-"));
    dirs.push(dir);

    const sourceDir = join(dir, "pages");
    mkdirSync(join(sourceDir, "people"), { recursive: true });
    const timelineMarkdown = [
      "- **2026-04-05** | meeting - Met in SF",
      "  Shared Brex update",
      "",
      "- **2026-03-01** | note - Sent follow-up",
    ].join("\n");

    writeFileSync(
      join(sourceDir, "people", "pedro-franceschi.md"),
      `---
title: Pedro Franceschi
type: person
---

# Pedro Franceschi

Notes.

---

${timelineMarkdown}
`,
    );

    const dbPath = join(dir, "brain.db");

    await expect(runImport(dbPath, sourceDir, false)).resolves.toBe("Imported 1 pages");

    expect(runTimelineList(dbPath, "people/pedro-franceschi")).toBe(
      "2026-04-05 | meeting | Met in SF | Shared Brex update\n2026-03-01 | note | Sent follow-up",
    );
    expect(runGet(dbPath, "people/pedro-franceschi")).toContain(`${timelineMarkdown}\n`);
  });

  it("keeps markdown timeline order aligned when backfilling an older event", () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-timeline-backfill-"));
    dirs.push(dir);

    const dbPath = join(dir, "brain.db");
    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "people/pedro-franceschi",
        type: "person",
        title: "Pedro Franceschi",
        compiledTruth: "# Pedro Franceschi",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Pedro Franceschi", type: "person" }),
      });
    } finally {
      brain.close();
    }

    runTimelineAdd(dbPath, "people/pedro-franceschi", "2026-04-05", "meeting", "Newer event");
    runTimelineAdd(dbPath, "people/pedro-franceschi", "2026-03-01", "note", "Older event");

    const timelineOutput = runTimelineList(dbPath, "people/pedro-franceschi").split("\n");
    const markdownOutput = runGet(dbPath, "people/pedro-franceschi");

    expect(timelineOutput).toEqual([
      "2026-04-05 | meeting | Newer event",
      "2026-03-01 | note | Older event",
    ]);
    expect(markdownOutput.indexOf("2026-04-05")).toBeLessThan(markdownOutput.indexOf("2026-03-01"));
  });
});

describe("ingest command", () => {
  it("stores a source page and records the ingest log", () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-ingest-"));
    dirs.push(dir);

    const dbPath = join(dir, "brain.db");
    const filePath = join(dir, "meeting-notes.txt");
    writeFileSync(filePath, "Customer call notes");

    expect(runIngest(dbPath, filePath, "meeting")).toBe(`Ingested ${filePath}`);

    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();

      const pages = brain.listPages({ type: "source", limit: 10 });
      const page = pages[0] ?? null;
      const ingestLog = brain.db
        .query<{ source_type: string; source_ref: string; pages_updated: string; summary: string }, []>(
          `SELECT source_type, source_ref, pages_updated, summary
           FROM ingest_log
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get();

      expect(page?.type).toBe("source");
      expect(page?.slug).toStartWith("sources/meeting-notes-");
      expect(page?.compiledTruth).toBe("Customer call notes");
      expect(ingestLog).toEqual({
        source_type: "meeting",
        source_ref: filePath,
        pages_updated: JSON.stringify([page?.slug]),
        summary: `Ingested ${filePath}`,
      });
    } finally {
      brain.close();
    }
  });

  it("keeps same-named files from different paths in separate source pages", () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-ingest-collision-"));
    dirs.push(dir);

    const firstDir = join(dir, "first");
    const secondDir = join(dir, "second");
    mkdirSync(firstDir, { recursive: true });
    mkdirSync(secondDir, { recursive: true });

    const firstPath = join(firstDir, "notes.txt");
    const secondPath = join(secondDir, "notes.txt");
    writeFileSync(firstPath, "First notes");
    writeFileSync(secondPath, "Second notes");

    const dbPath = join(dir, "brain.db");

    expect(runIngest(dbPath, firstPath, "meeting")).toBe(`Ingested ${firstPath}`);
    expect(runIngest(dbPath, secondPath, "meeting")).toBe(`Ingested ${secondPath}`);

    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      const pages = brain.listPages({ type: "source", limit: 10 });

      expect(pages).toHaveLength(2);
      expect(pages.map((page) => page.compiledTruth).sort()).toEqual(["First notes", "Second notes"]);
      expect(new Set(pages.map((page) => page.slug)).size).toBe(2);
    } finally {
      brain.close();
    }
  });
});
