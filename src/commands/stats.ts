import { BrainDatabase } from "../core/db";

export function runStats(dbPath: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const stats = brain.stats();
    return `Pages: ${stats.pages}`;
  } finally {
    brain.close();
  }
}
