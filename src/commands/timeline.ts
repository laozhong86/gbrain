import { BrainDatabase } from "../core/db";

export function runTimelineAdd(
  dbPath: string,
  slug: string,
  date: string,
  source: string,
  summary: string,
  detail = "",
): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    brain.addTimelineEntry(slug, date, source, summary, detail);
    return `Added timeline entry to ${slug}`;
  } finally {
    brain.close();
  }
}

export function runTimelineList(dbPath: string, slug: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const entries = brain.listTimelineEntries(slug);
    return entries
      .map((entry) =>
        [entry.date, entry.source, entry.summary, entry.detail].filter((value) => value.length > 0).join(" | "),
      )
      .join("\n");
  } finally {
    brain.close();
  }
}
