import { BrainDatabase } from "../core/db";

export function runLink(dbPath: string, from: string, to: string, context = ""): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    brain.linkPages(from, to, context);
    return `Linked ${from} -> ${to}`;
  } finally {
    brain.close();
  }
}

export function runUnlink(dbPath: string, from: string, to: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    brain.unlinkPages(from, to);
    return `Unlinked ${from} -> ${to}`;
  } finally {
    brain.close();
  }
}

export function runBacklinks(dbPath: string, slug: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    return brain.backlinks(slug).join("\n");
  } finally {
    brain.close();
  }
}
