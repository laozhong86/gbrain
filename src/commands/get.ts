import { renderMarkdownDocument } from "../core/markdown";
import { BrainDatabase } from "../core/db";

export function runGet(dbPath: string, slug: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const page = brain.getPageBySlug(slug);

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    return renderMarkdownDocument({
      frontmatter: JSON.parse(page.frontmatter) as Record<string, unknown>,
      compiledTruth: page.compiledTruth,
      timeline: page.timeline,
    });
  } finally {
    brain.close();
  }
}
