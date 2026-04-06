import { afterEach, describe, expect, it } from "bun:test";
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

describe("BrainDatabase.initialize", () => {
  it("creates the schema and default config rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-db-"));
    cleanup.push(dir);
    const dbPath = join(dir, "brain.db");

    const brain = new BrainDatabase(dbPath);
    brain.initialize();

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
});
