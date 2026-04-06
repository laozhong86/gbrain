import type { Database } from "bun:sqlite";
import type { PageType } from "./types";

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

const SEARCH_TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;

export function normalizeFtsQuery(query: string): string {
  const tokens = query.match(SEARCH_TOKEN_PATTERN) ?? [];

  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND ");
}

export interface SearchFtsOptions {
  limit?: number;
  type?: PageType;
}

export function searchFTS(db: Database, query: string, options: SearchFtsOptions = {}): FtsResult[] {
  const normalizedLimit =
    options.limit !== undefined && Number.isInteger(options.limit) && options.limit > 0
      ? options.limit
      : 10;
  const normalizedQuery = normalizeFtsQuery(query);

  if (normalizedQuery === "") {
    return [];
  }

  const normalizedType = options.type;
  const typeClause = normalizedType ? " AND pages.type = ?3" : "";
  const params = normalizedType
    ? [normalizedQuery, normalizedLimit, normalizedType]
    : [normalizedQuery, normalizedLimit];

  return db
    .query<FtsRow, Array<string | number>>(
      `SELECT pages.slug, pages.title, bm25(page_fts) * -1 AS score,
              COALESCE(snippet(page_fts, -1, '[', ']', '...', 12), '') AS excerpt
       FROM page_fts
       JOIN pages ON pages.id = page_fts.rowid
       WHERE page_fts MATCH ?1
       ${typeClause}
       ORDER BY bm25(page_fts)
       LIMIT ?2`,
    )
    .all(...params)
    .map((row) => ({
      slug: row.slug,
      title: row.title,
      score: Number(row.score),
      excerpt: row.excerpt ?? "",
    }));
}
