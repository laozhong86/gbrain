import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrainDatabase } from "../src/core/db";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length) {
    rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

function createDatabase(): BrainDatabase {
  const dir = mkdtempSync(join(tmpdir(), "gbrain-db-"));
  cleanup.push(dir);
  const dbPath = join(dir, "brain.db");

  const brain = new BrainDatabase(dbPath);
  brain.initialize();
  return brain;
}

function createLegacyDatabase(): BrainDatabase {
  const dir = mkdtempSync(join(tmpdir(), "gbrain-legacy-db-"));
  cleanup.push(dir);
  const dbPath = join(dir, "brain.db");
  const legacy = new Database(dbPath, { create: true });

  legacy.exec(`
    CREATE TABLE pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      compiled_truth TEXT NOT NULL DEFAULT '',
      timeline TEXT NOT NULL DEFAULT '',
      frontmatter TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
  legacy.close();

  return new BrainDatabase(dbPath);
}

describe("BrainDatabase.initialize", () => {
  it("creates the schema and default config rows", () => {
    const brain = createDatabase();
    const pagesTable = brain.db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pages'",
      )
      .get();
    const configRow = brain.db
      .query<{ value: string }, []>("SELECT value FROM config WHERE key = 'embedding_model'")
      .get();

    expect(pagesTable?.name).toBe("pages");
    expect(configRow?.value).toBe("text-embedding-3-small");

    brain.close();
  });

  it("remains safe when called more than once", () => {
    const brain = createDatabase();

    brain.initialize();

    const configCount = brain.db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM config")
      .get();

    expect(configCount?.count).toBe(4);

    brain.close();
  });

  it("upgrades a legacy pages table to reject invalid page types", () => {
    const brain = createLegacyDatabase();

    brain.initialize();

    expect(() =>
      brain.db
        .query(
          "INSERT INTO pages (slug, type, title, compiled_truth, timeline, frontmatter) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("legacy-invalid-type", "unknown", "Bad Type", "", "", "{}"),
    ).toThrow();

    brain.close();
  });
});

describe("pages schema behavior", () => {
  it("rejects values outside the PageType set", () => {
    const brain = createDatabase();

    expect(() =>
      brain.db
        .query(
          "INSERT INTO pages (slug, type, title, compiled_truth, timeline, frontmatter) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("invalid-type", "unknown", "Bad Type", "", "", "{}"),
    ).toThrow();

    brain.close();
  });

  it("updates updated_at after page updates", async () => {
    const brain = createDatabase();

    brain.db
      .query(
        "INSERT INTO pages (slug, type, title, compiled_truth, timeline, frontmatter) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("updated-at", "person", "Before", "old truth", "", "{}");

    const before = brain.db
      .query<{ updated_at: string }, []>("SELECT updated_at FROM pages WHERE slug = 'updated-at'")
      .get();

    await Bun.sleep(20);

    brain.db.query("UPDATE pages SET compiled_truth = ? WHERE slug = ?").run("new truth", "updated-at");

    const after = brain.db
      .query<{ updated_at: string }, []>("SELECT updated_at FROM pages WHERE slug = 'updated-at'")
      .get();

    expect(before?.updated_at).toBeDefined();
    expect(after?.updated_at).toBeDefined();
    expect(after?.updated_at).not.toBe(before?.updated_at);

    brain.close();
  });

  it("keeps FTS in sync across insert, update, and delete", () => {
    const brain = createDatabase();

    brain.db
      .query(
        "INSERT INTO pages (slug, type, title, compiled_truth, timeline, frontmatter) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("fts-page", "person", "Alpha", "first body", "", "{}");

    const inserted = brain.db
      .query<{ rowid: number }, []>("SELECT rowid FROM page_fts WHERE page_fts MATCH 'first'")
      .get();

    expect(inserted?.rowid).toBeDefined();

    brain.db
      .query("UPDATE pages SET compiled_truth = ?, title = ? WHERE slug = ?")
      .run("second body", "Beta", "fts-page");

    const oldMatch = brain.db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM page_fts WHERE page_fts MATCH 'first'")
      .get();
    const updatedMatch = brain.db
      .query<{ rowid: number }, []>("SELECT rowid FROM page_fts WHERE page_fts MATCH 'second'")
      .get();

    expect(oldMatch?.count).toBe(0);
    expect(updatedMatch?.rowid).toBeDefined();

    brain.db.query("DELETE FROM pages WHERE slug = ?").run("fts-page");

    const deletedMatch = brain.db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM page_fts WHERE page_fts MATCH 'second'")
      .get();

    expect(deletedMatch?.count).toBe(0);

    brain.close();
  });
});
