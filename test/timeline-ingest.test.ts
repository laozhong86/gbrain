import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIngest } from "../src/commands/ingest";
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

      const page = brain.getPageBySlug("sources/meeting-notes");
      const ingestLog = brain.db
        .query<{ source_type: string; source_ref: string; pages_updated: string; summary: string }, []>(
          `SELECT source_type, source_ref, pages_updated, summary
           FROM ingest_log
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get();

      expect(page?.type).toBe("source");
      expect(page?.compiledTruth).toBe("Customer call notes");
      expect(ingestLog).toEqual({
        source_type: "meeting",
        source_ref: filePath,
        pages_updated: JSON.stringify(["sources/meeting-notes"]),
        summary: `Ingested ${filePath}`,
      });
    } finally {
      brain.close();
    }
  });
});
