import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { PAGE_TYPE_SQL_LIST } from "./types";

const schemaSql = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const createPagesTableSql = `
CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN (${PAGE_TYPE_SQL_LIST})),
  title TEXT NOT NULL,
  compiled_truth TEXT NOT NULL DEFAULT '',
  timeline TEXT NOT NULL DEFAULT '',
  frontmatter TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
)`;

export class BrainDatabase {
  readonly db: Database;

  constructor(readonly dbPath: string) {
    this.db = new Database(dbPath, { create: true });
  }

  initialize(): void {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.upgradeLegacyPagesSchema();
    this.db.exec(schemaSql);
  }

  close(): void {
    this.db.close();
  }

  private upgradeLegacyPagesSchema(): void {
    const pagesTable = this.db
      .query<{ sql: string | null }, []>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pages'",
      )
      .get();

    if (!pagesTable?.sql || pagesTable.sql.includes("CHECK")) {
      return;
    }

    const invalidRows = this.db
      .query<{ count: number }, []>(
        `SELECT COUNT(*) AS count FROM pages WHERE type NOT IN (${PAGE_TYPE_SQL_LIST})`,
      )
      .get();

    if ((invalidRows?.count ?? 0) > 0) {
      throw new Error("Cannot upgrade legacy pages schema with invalid page types present");
    }

    this.db.exec("PRAGMA foreign_keys = OFF;");
    this.db.exec("BEGIN IMMEDIATE;");

    try {
      this.db.exec("DROP TRIGGER IF EXISTS pages_ai;");
      this.db.exec("DROP TRIGGER IF EXISTS pages_ad;");
      this.db.exec("DROP TRIGGER IF EXISTS pages_au;");
      this.db.exec("DROP TRIGGER IF EXISTS pages_touch_updated_at;");
      this.db.exec("DROP INDEX IF EXISTS idx_pages_type;");
      this.db.exec("DROP INDEX IF EXISTS idx_pages_slug;");
      this.db.exec("DROP TABLE IF EXISTS page_fts;");
      this.db.exec("ALTER TABLE pages RENAME TO pages_legacy;");
      this.db.exec(createPagesTableSql);
      this.db.exec(`
        INSERT INTO pages (id, slug, type, title, compiled_truth, timeline, frontmatter, created_at, updated_at)
        SELECT id, slug, type, title, compiled_truth, timeline, frontmatter, created_at, updated_at
        FROM pages_legacy
      `);
      this.db.exec("DROP TABLE pages_legacy;");
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }
}
