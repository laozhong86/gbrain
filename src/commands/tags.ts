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
    const current = brain.tagsForPage(slug);
    brain.replaceTags(slug, [...current, tag]);
    return `Tagged ${slug} with ${tag}`;
  } finally {
    brain.close();
  }
}

export function runUntag(dbPath: string, slug: string, tag: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const current = brain.tagsForPage(slug).filter((entry) => entry !== tag);
    brain.replaceTags(slug, current);
    return `Removed ${tag} from ${slug}`;
  } finally {
    brain.close();
  }
}
