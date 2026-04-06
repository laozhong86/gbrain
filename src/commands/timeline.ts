import { BrainDatabase } from "../core/db";

export interface TimelineAddOptions {
  date: string;
  summary: string;
  source?: string;
  detail?: string;
}

export function runTimelineAdd(
  dbPath: string,
  slug: string,
  options: TimelineAddOptions,
): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    brain.addTimelineEntry(
      slug,
      options.date,
      options.source ?? "manual",
      options.summary,
      options.detail ?? "",
    );
    return `Added timeline entry to ${slug}`;
  } finally {
    brain.close();
  }
}

export function runTimelineList(dbPath: string, slug: string, limit?: number): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const entries = brain.listTimelineEntries(slug);
    const normalizedEntries = limit === undefined || limit <= 0 ? entries : entries.slice(0, limit);
    return normalizedEntries
      .map((entry) =>
        [entry.date, entry.source, entry.summary, entry.detail].filter((value) => value.length > 0).join(" | "),
      )
      .join("\n");
  } finally {
    brain.close();
  }
}
