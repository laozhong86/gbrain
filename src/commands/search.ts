import { BrainDatabase } from "../core/db";
import { searchFTS } from "../core/fts";
import { isPageType } from "../core/types";

export interface SearchCommandOptions {
  limit?: number;
  type?: string;
}

export function runSearch(dbPath: string, query: string, options: SearchCommandOptions = {}): string {
  const brain = new BrainDatabase(dbPath);
  const normalizedType = options.type?.trim();

  try {
    brain.initialize();
    if (normalizedType !== undefined && !isPageType(normalizedType)) {
      throw new Error(`Unsupported page type: ${normalizedType}`);
    }

    const results = searchFTS(brain.db, query, {
      limit: options.limit,
      type: normalizedType,
    });

    return results
      .map((result) => `${result.slug} (score: ${result.score.toFixed(2)})\n  ${result.excerpt}`)
      .join("\n");
  } finally {
    brain.close();
  }
}
