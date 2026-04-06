import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { ListPagesOptions, PageRecord, PageUpsertInput } from "./types";
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

interface PageRow {
  id: number;
  slug: string;
  type: PageRecord["type"];
  title: string;
  compiled_truth: string;
  timeline: string;
  frontmatter: string;
  created_at: string;
  updated_at: string;
}

interface PageIdRow {
  id: number;
}

function mapPageRow(row: PageRow): PageRecord {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    compiledTruth: row.compiled_truth,
    timeline: row.timeline,
    frontmatter: row.frontmatter,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BrainDatabase {
  readonly db: Database;

  constructor(readonly dbPath: string) {
    this.db = new Database(dbPath, { create: true });
  }

  initialize(): void {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    const didUpgradeLegacyPages = this.upgradeLegacyPagesSchema();
    this.db.exec(schemaSql);
    if (didUpgradeLegacyPages) {
      this.db.exec("INSERT INTO page_fts(page_fts) VALUES ('rebuild');");
    }
  }

  close(): void {
    this.db.close();
  }

  upsertPage(input: PageUpsertInput): void {
    this.db
      .query(
        `INSERT INTO pages (slug, type, title, compiled_truth, timeline, frontmatter)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(slug) DO UPDATE SET
           type = excluded.type,
           title = excluded.title,
           compiled_truth = excluded.compiled_truth,
           timeline = excluded.timeline,
           frontmatter = excluded.frontmatter,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(
        input.slug,
        input.type,
        input.title,
        input.compiledTruth,
        input.timeline,
        input.frontmatter,
      );
  }

  replacePageTags(slug: string, tags: string[]): void {
    const page = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(slug);

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    const normalizedTags = Array.from(
      new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
    );

    this.db.transaction(() => {
      this.db.query("DELETE FROM tags WHERE page_id = ?1").run(page.id);

      const insertTag = this.db.query(
        "INSERT INTO tags (page_id, tag) VALUES (?1, ?2) ON CONFLICT(page_id, tag) DO NOTHING",
      );

      for (const tag of normalizedTags) {
        insertTag.run(page.id, tag);
      }
    })();
  }

  getPageBySlug(slug: string): PageRecord | null {
    const row = this.db
      .query<PageRow, [string]>(
        `SELECT id, slug, type, title, compiled_truth, timeline, frontmatter, created_at, updated_at
         FROM pages
         WHERE slug = ?1`,
      )
      .get(slug);

    return row ? mapPageRow(row) : null;
  }

  listPages(options: ListPagesOptions = {}): PageRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    const joins: string[] = [];

    if (options.type) {
      clauses.push("type = ?");
      params.push(options.type);
    }

    if (options.tag) {
      joins.push("INNER JOIN tags ON tags.page_id = pages.id");
      clauses.push("tags.tag = ?");
      params.push(options.tag);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = options.limit ?? 50;
    const joinClause = joins.length > 0 ? `${joins.join(" ")}` : "";

    return this.db
      .query<PageRow, Array<string | number>>(
        `SELECT
           pages.id,
           pages.slug,
           pages.type,
           pages.title,
           pages.compiled_truth,
           pages.timeline,
           pages.frontmatter,
           pages.created_at,
           pages.updated_at
         FROM pages
         ${joinClause}
         ${whereClause}
         ORDER BY slug
         LIMIT ?`,
      )
      .all(...params, limit)
      .map(mapPageRow);
  }

  stats(): { pages: number } {
    const row = this.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM pages").get();
    return { pages: row?.count ?? 0 };
  }

  private upgradeLegacyPagesSchema(): boolean {
    const pagesTable = this.db
      .query<{ sql: string | null }, []>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pages'",
      )
      .get();

    if (!pagesTable?.sql || pagesTable.sql.includes("CHECK")) {
      return false;
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
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }
}
