import type { Database } from "bun:sqlite";

export interface FtsResult {
  slug: string;
  title: string;
  score: number;
  excerpt: string;
}

interface FtsRow {
  slug: string;
  title: string;
  score: number;
  excerpt: string | null;
}

export function searchFTS(db: Database, query: string, limit = 10): FtsResult[] {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;

  return db
    .query<FtsRow, [string, number]>(
      `SELECT pages.slug, pages.title, bm25(page_fts) * -1 AS score,
              COALESCE(snippet(page_fts, 1, '[', ']', '...', 12), '') AS excerpt
       FROM page_fts
       JOIN pages ON pages.id = page_fts.rowid
       WHERE page_fts MATCH ?1
       ORDER BY bm25(page_fts)
       LIMIT ?2`,
    )
    .all(query, normalizedLimit)
    .map((row) => ({
      slug: row.slug,
      title: row.title,
      score: Number(row.score),
      excerpt: row.excerpt ?? "",
    }));
}
