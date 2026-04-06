import { BrainDatabase } from "../core/db";

export function runTags(dbPath: string, slug: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    return brain.tagsForPage(slug).join("\n");
  } finally {
    brain.close();
  }
}

export function runTag(dbPath: string, slug: string, tag: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    brain.addTagToPage(slug, tag);
    return `Tagged ${slug} with ${tag}`;
  } finally {
    brain.close();
  }
}

export function runUntag(dbPath: string, slug: string, tag: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    brain.removeTagFromPage(slug, tag);
    return `Removed ${tag} from ${slug}`;
  } finally {
    brain.close();
  }
}
