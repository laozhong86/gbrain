import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  cosineSimilarity,
  decodeEmbedding,
  encodeEmbedding,
  type EmbeddingProvider,
  type VectorSearchResult,
} from "./embeddings";
import type { ListPagesOptions, PageRecord, PageUpsertInput } from "./types";
import { PAGE_TYPE_SQL_LIST } from "./types";
// @ts-expect-error Bun bundles .sql text imports for the compiled binary.
import schemaSql from "../schema.sql" with { type: "text" };
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

interface LinkInput {
  targetSlug: string;
  context: string;
}

interface RawDataRecord {
  source: string;
  data: string;
}

interface IngestLogRow {
  source_type: string;
  source_ref: string;
  pages_updated: string;
  summary: string;
  timestamp: string;
}

interface EmbeddingRow {
  slug: string;
  chunk_text: string;
  embedding: Uint8Array | ArrayBuffer;
}

interface TimelineEntryRow {
  date: string;
  source: string;
  summary: string;
  detail: string;
}

interface StoredTimelineEntryRow extends TimelineEntryRow {
  id: number;
}

const TIMELINE_ENTRY_PATTERN = /^- \*\*(\d{4}-\d{2}-\d{2})\*\*\s*\|\s*(.*?)\s+(?:—|-)\s+(.*)$/;

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)));
}

function normalizeRawDataJson(data: string): string {
  try {
    return JSON.stringify(JSON.parse(data));
  } catch {
    throw new Error("Raw data must be valid JSON");
  }
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

function normalizeTimelineMarkdown(timeline: string): string {
  return timeline.replace(/\r\n/g, "\n").trim();
}

function parseTimelineMarkdown(timeline: string): TimelineEntryRow[] {
  const entries: TimelineEntryRow[] = [];
  let currentEntry: TimelineEntryRow | null = null;

  for (const line of normalizeTimelineMarkdown(timeline).split("\n")) {
    const trimmedLine = line.trimEnd();

    if (trimmedLine.trim().length === 0) {
      continue;
    }

    const match = trimmedLine.trim().match(TIMELINE_ENTRY_PATTERN);

    if (match) {
      currentEntry = {
        date: match[1],
        source: match[2].trim(),
        summary: match[3].trim(),
        detail: "",
      };
      entries.push(currentEntry);
      continue;
    }

    if (!currentEntry) {
      continue;
    }

    const continuation = trimmedLine.trim();
    currentEntry.detail = currentEntry.detail.length > 0
      ? `${currentEntry.detail}\n${continuation}`
      : continuation;
  }

  return entries;
}

function formatTimelineEntry(entry: TimelineEntryRow): string {
  const lines = [`- **${entry.date}** | ${entry.source} — ${entry.summary}`];

  if (entry.detail) {
    lines.push(entry.detail);
  }

  return lines.join("\n");
}

export class BrainDatabase {
  readonly db: Database;

  constructor(readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
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

  transaction<T>(callback: () => T): T {
    return this.db.transaction(callback)();
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

    const page = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(input.slug);

    if (!page) {
      throw new Error(`Page not found after upsert: ${input.slug}`);
    }

    this.synchronizeTimelineEntriesFromMarkdown(page.id, input.timeline);
  }

  replacePageTags(slug: string, tags: string[]): void {
    const page = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(slug);

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    const normalizedTags = normalizeTags(tags);

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

  tagsForPage(slug: string): string[] {
    const page = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(slug);

    if (!page) {
      return [];
    }

    return this.db
      .query<{ tag: string }, [number]>("SELECT tag FROM tags WHERE page_id = ?1 ORDER BY tag")
      .all(page.id)
      .map((row) => row.tag);
  }

  replaceTags(slug: string, tags: string[]): void {
    this.replacePageTags(slug, tags);
  }

  getConfig(key: string): string | null {
    const row = this.db
      .query<{ value: string }, [string]>("SELECT value FROM config WHERE key = ?1")
      .get(key);

    return row?.value ?? null;
  }

  setConfig(key: string, value: string): void {
    this.db
      .query(
        `INSERT INTO config (key, value)
         VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  deleteConfig(key: string): void {
    this.db.query("DELETE FROM config WHERE key = ?1").run(key);
  }

  addTagToPage(slug: string, tag: string): void {
    const page = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(slug);
    const normalizedTag = normalizeTags([tag])[0];

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    if (!normalizedTag) {
      return;
    }

    this.db
      .query(
        "INSERT INTO tags (page_id, tag) VALUES (?1, ?2) ON CONFLICT(page_id, tag) DO NOTHING",
      )
      .run(page.id, normalizedTag);
  }

  removeTagFromPage(slug: string, tag: string): void {
    const page = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(slug);
    const normalizedTag = normalizeTags([tag])[0];

    if (!page || !normalizedTag) {
      return;
    }

    this.db.query("DELETE FROM tags WHERE page_id = ?1 AND tag = ?2").run(page.id, normalizedTag);
  }

  linkPages(fromSlug: string, toSlug: string, context = ""): void {
    const fromPage = this.db
      .query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1")
      .get(fromSlug);
    const toPage = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(toSlug);

    if (!fromPage || !toPage) {
      throw new Error("Both pages must exist before linking");
    }

    this.db
      .query(
        `INSERT INTO links (from_page_id, to_page_id, context)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(from_page_id, to_page_id) DO UPDATE SET context = excluded.context`,
      )
      .run(fromPage.id, toPage.id, context);
  }

  unlinkPages(fromSlug: string, toSlug: string): void {
    const fromPage = this.db
      .query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1")
      .get(fromSlug);
    const toPage = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(toSlug);

    if (!fromPage || !toPage) {
      return;
    }

    this.db
      .query("DELETE FROM links WHERE from_page_id = ?1 AND to_page_id = ?2")
      .run(fromPage.id, toPage.id);
  }

  backlinks(slug: string): string[] {
    const page = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(slug);

    if (!page) {
      return [];
    }

    return this.db
      .query<{ slug: string }, [number]>(
        `SELECT pages.slug
         FROM links
         INNER JOIN pages ON pages.id = links.from_page_id
         WHERE links.to_page_id = ?1
         ORDER BY pages.slug`,
      )
      .all(page.id)
      .map((row) => row.slug);
  }

  replaceOutgoingLinks(slug: string, links: LinkInput[]): void {
    const page = this.db.query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1").get(slug);

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    const normalizedLinks = new Map<string, string>();

    for (const link of links) {
      if (link.targetSlug === slug) {
        continue;
      }

      const targetPage = this.db
        .query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1")
        .get(link.targetSlug);

      if (targetPage) {
        normalizedLinks.set(link.targetSlug, link.context);
      }
    }

    this.db.transaction(() => {
      this.db.query("DELETE FROM links WHERE from_page_id = ?1").run(page.id);

      const insertLink = this.db.query(
        `INSERT INTO links (from_page_id, to_page_id, context)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(from_page_id, to_page_id) DO UPDATE SET context = excluded.context`,
      );

      for (const [targetSlug, context] of normalizedLinks) {
        const targetPage = this.db
          .query<PageIdRow, [string]>("SELECT id FROM pages WHERE slug = ?1")
          .get(targetSlug);

        if (targetPage) {
          insertLink.run(page.id, targetPage.id, context);
        }
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

  addTimelineEntry(slug: string, date: string, source: string, summary: string, detail: string): void {
    const page = this.getPageBySlug(slug);

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    this.transaction(() => {
      this.db
        .query(
          `INSERT INTO timeline_entries (page_id, date, source, summary, detail)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .run(page.id, date, source, summary, detail);
      this.writeTimelineMarkdown(page.id, this.renderTimelineMarkdown(this.listStoredTimelineEntries(page.id)));
    });
  }

  listTimelineEntries(slug: string): TimelineEntryRow[] {
    const page = this.getPageBySlug(slug);

    if (!page) {
      return [];
    }

    let entries = this.listStoredTimelineEntries(page.id);

    if (entries.length === 0 && normalizeTimelineMarkdown(page.timeline).length > 0) {
      this.synchronizeTimelineEntriesFromMarkdown(page.id, page.timeline);
      entries = this.listStoredTimelineEntries(page.id);
    }

    return entries.map(({ id: _id, ...entry }) => entry);
  }

  appendIngestLog(sourceType: string, sourceRef: string, pagesUpdated: string[], summary: string): void {
    this.db
      .query(
        `INSERT INTO ingest_log (source_type, source_ref, pages_updated, summary)
         VALUES (?1, ?2, ?3, ?4)`,
      )
      .run(sourceType, sourceRef, JSON.stringify(pagesUpdated), summary);
  }

  replaceImportedLog(sourceRef: string, summaries: string[]): void {
    this.db
      .query("DELETE FROM ingest_log WHERE source_type = 'import' AND source_ref = ?1")
      .run(sourceRef);

    const insertLog = this.db.query(
      `INSERT INTO ingest_log (source_type, source_ref, pages_updated, summary)
       VALUES ('import', ?1, '[]', ?2)`,
    );

    for (const summary of summaries) {
      insertLog.run(sourceRef, summary);
    }
  }

  deletePagesNotIn(slugs: string[]): void {
    if (slugs.length === 0) {
      this.db.query("DELETE FROM pages").run();
      return;
    }

    const placeholders = slugs.map((_, index) => `?${index + 1}`).join(", ");
    this.db.query(`DELETE FROM pages WHERE slug NOT IN (${placeholders})`).run(...slugs);
  }

  replaceRawData(slug: string, records: RawDataRecord[]): void {
    const page = this.getPageBySlug(slug);

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    const normalizedRecords = new Map<string, string>();

    for (const record of records) {
      const source = record.source.trim();

      if (source.length === 0) {
        continue;
      }

      normalizedRecords.set(source, normalizeRawDataJson(record.data));
    }

    this.db.transaction(() => {
      this.db.query("DELETE FROM raw_data WHERE page_id = ?1").run(page.id);

      const insertRaw = this.db.query(
        `INSERT INTO raw_data (page_id, source, data)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(page_id, source) DO UPDATE SET
           data = excluded.data,
           fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      );

      for (const [source, data] of normalizedRecords) {
        insertRaw.run(page.id, source, data);
      }
    })();
  }

  upsertRawDataSource(slug: string, source: string, data: string): void {
    const page = this.getPageBySlug(slug);
    const normalizedSource = source.trim();

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    if (normalizedSource.length === 0) {
      return;
    }

    this.db
      .query(
        `INSERT INTO raw_data (page_id, source, data)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(page_id, source) DO UPDATE SET
           data = excluded.data,
           fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(page.id, normalizedSource, normalizeRawDataJson(data));
  }

  listRawData(): Array<{ slug: string; source: string; data: string }> {
    return this.db
      .query<{ slug: string; source: string; data: string }, []>(
        `SELECT pages.slug, raw_data.source, raw_data.data
         FROM raw_data
         INNER JOIN pages ON pages.id = raw_data.page_id
         ORDER BY pages.slug, raw_data.source`,
      )
      .all();
  }

  listRawDataForPage(slug: string, source?: string): RawDataRecord[] {
    const page = this.getPageBySlug(slug);

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    if (source) {
      return this.db
        .query<RawDataRecord, [number, string]>(
          `SELECT source, data
           FROM raw_data
           WHERE page_id = ?1 AND source = ?2
           ORDER BY source`,
        )
        .all(page.id, source);
    }

    return this.db
      .query<RawDataRecord, [number]>(
        `SELECT source, data
         FROM raw_data
         WHERE page_id = ?1
         ORDER BY source`,
      )
      .all(page.id);
  }

  replaceEmbeddings(
    slug: string,
    chunks: Array<{ chunkText: string; values: number[] }>,
    provider: EmbeddingProvider,
  ): void {
    const page = this.getPageBySlug(slug);

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    this.db.transaction(() => {
      this.db.query("DELETE FROM page_embeddings WHERE page_id = ?1").run(page.id);

      const insertEmbedding = this.db.query(
        `INSERT INTO page_embeddings (page_id, chunk_index, chunk_text, embedding, model)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      );

      for (const [chunkIndex, chunk] of chunks.entries()) {
        if (chunk.values.length !== provider.dimensions) {
          throw new Error(
            `Embedding dimensions mismatch for ${slug}: expected ${provider.dimensions}, received ${chunk.values.length}`,
          );
        }

        insertEmbedding.run(
          page.id,
          chunkIndex,
          chunk.chunkText,
          encodeEmbedding(chunk.values),
          provider.model,
        );
      }
    })();
  }

  async searchSemantic(
    question: string,
    provider: EmbeddingProvider,
    limit = 10,
  ): Promise<VectorSearchResult[]> {
    const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
    const queryEmbedding = await provider.embed(question);

    if (queryEmbedding.length !== provider.dimensions) {
      throw new Error(
        `Embedding dimensions mismatch for query: expected ${provider.dimensions}, received ${queryEmbedding.length}`,
      );
    }

    const rows = this.db
      .query<EmbeddingRow, [string]>(
        `SELECT pages.slug, page_embeddings.chunk_text, page_embeddings.embedding
         FROM page_embeddings
         INNER JOIN pages ON pages.id = page_embeddings.page_id
         WHERE page_embeddings.model = ?1`,
      )
      .all(provider.model);
    const bestBySlug = new Map<string, VectorSearchResult>();

    for (const row of rows) {
      const bytes = row.embedding instanceof Uint8Array ? row.embedding : new Uint8Array(row.embedding);
      if (bytes.byteLength !== provider.dimensions * Float32Array.BYTES_PER_ELEMENT) {
        continue;
      }

      const score = cosineSimilarity(queryEmbedding, decodeEmbedding(bytes));
      const previous = bestBySlug.get(row.slug);

      if (!previous || score > previous.score) {
        bestBySlug.set(row.slug, {
          slug: row.slug,
          score,
          chunkText: row.chunk_text,
        });
      }
    }

    return [...bestBySlug.values()].sort((left, right) => right.score - left.score).slice(0, normalizedLimit);
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

  listIngestLog(): Array<{
    sourceType: string;
    sourceRef: string;
    pagesUpdated: string;
    summary: string;
    timestamp: string;
  }> {
    return this.db
      .query<IngestLogRow, []>(
        `SELECT source_type, source_ref, pages_updated, summary, timestamp
         FROM ingest_log
         ORDER BY timestamp ASC, id ASC`,
      )
      .all()
      .map((row) => ({
        sourceType: row.source_type,
        sourceRef: row.source_ref,
        pagesUpdated: row.pages_updated,
        summary: row.summary,
        timestamp: row.timestamp,
      }));
  }

  private listStoredTimelineEntries(pageId: number): StoredTimelineEntryRow[] {
    return this.db
      .query<StoredTimelineEntryRow, [number]>(
        `SELECT id, date, source, summary, detail
         FROM timeline_entries
         WHERE page_id = ?1
         ORDER BY date DESC, id DESC`,
      )
      .all(pageId);
  }

  private renderTimelineMarkdown(entries: TimelineEntryRow[]): string {
    return entries.map(formatTimelineEntry).join("\n");
  }

  private writeTimelineMarkdown(pageId: number, timeline: string): void {
    this.db
      .query(
        `UPDATE pages
         SET timeline = ?1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?2`,
      )
      .run(timeline, pageId);
  }

  private synchronizeTimelineEntriesFromMarkdown(pageId: number, timeline: string): void {
    const parsedEntries = parseTimelineMarkdown(timeline);

    this.db.query("DELETE FROM timeline_entries WHERE page_id = ?1").run(pageId);

    if (parsedEntries.length > 0) {
      const insertTimelineEntry = this.db.query(
        `INSERT INTO timeline_entries (page_id, date, source, summary, detail)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      );

      for (const entry of parsedEntries) {
        insertTimelineEntry.run(pageId, entry.date, entry.source, entry.summary, entry.detail);
      }
    }
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
