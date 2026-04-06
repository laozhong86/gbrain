import { renderMarkdownDocument } from "../core/markdown";
import { BrainDatabase } from "../core/db";

function parseStoredFrontmatter(slug: string, frontmatter: string): Record<string, unknown> {
  try {
    return JSON.parse(frontmatter) as Record<string, unknown>;
  } catch {
    throw new Error(`Stored frontmatter is invalid JSON for page: ${slug}`);
  }
}

export function runGet(dbPath: string, slug: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const page = brain.getPageBySlug(slug);

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    return renderMarkdownDocument({
      frontmatter: parseStoredFrontmatter(slug, page.frontmatter),
      compiledTruth: page.compiledTruth,
      timeline: page.timeline,
    });
  } finally {
    brain.close();
  }
}
