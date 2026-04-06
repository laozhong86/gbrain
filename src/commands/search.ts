import { BrainDatabase } from "../core/db";
import { searchFTS } from "../core/fts";

export function runSearch(dbPath: string, query: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const results = searchFTS(brain.db, query);

    return results
      .map((result) => `${result.slug} (score: ${result.score.toFixed(2)})\n  ${result.excerpt}`)
      .join("\n");
  } finally {
    brain.close();
  }
}
