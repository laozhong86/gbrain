import { BrainDatabase } from "../core/db";

export function runList(dbPath: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const pages = brain.listPages();
    return pages.map((page) => `${page.slug} | ${page.type} | ${page.title}`).join("\n");
  } finally {
    brain.close();
  }
}
