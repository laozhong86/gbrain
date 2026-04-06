import { BrainDatabase } from "../core/db";
import { isPageType } from "../core/types";

export interface ListCommandOptions {
  tag?: string;
  type?: string;
  limit?: number;
}

function normalizeListLimit(limit?: number): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("List limit must be a positive integer");
  }

  return limit;
}

export function runList(dbPath: string, options: ListCommandOptions = {}): string {
  const brain = new BrainDatabase(dbPath);
  const normalizedType = options.type?.trim();

  try {
    brain.initialize();
    if (normalizedType !== undefined && !isPageType(normalizedType)) {
      throw new Error(`Unsupported page type: ${normalizedType}`);
    }

    const pages = brain.listPages({
      tag: options.tag,
      type: normalizedType,
      limit: normalizeListLimit(options.limit),
    });
    return pages.map((page) => `${page.slug} | ${page.type} | ${page.title}`).join("\n");
  } finally {
    brain.close();
  }
}
