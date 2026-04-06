import { BrainDatabase } from "../core/db";
import { chunkPageContent } from "../core/markdown";
import type { EmbeddingProvider } from "../core/embeddings";

export async function runEmbed(
  dbPath: string,
  slug: string | undefined,
  provider: EmbeddingProvider,
): Promise<string> {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const pages = slug ? [brain.getPageBySlug(slug)].filter((page) => page !== null) : brain.listPages({ limit: 100000 });

    if (slug && pages.length === 0) {
      throw new Error(`Page not found: ${slug}`);
    }

    for (const page of pages) {
      const chunks = chunkPageContent(page.compiledTruth, page.timeline);
      const preparedChunks: Array<{ chunkText: string; values: number[] }> = [];

      for (const chunk of chunks) {
        preparedChunks.push({
          chunkText: chunk,
          values: await provider.embed(chunk),
        });
      }

      brain.replaceEmbeddings(page.slug, preparedChunks, provider);
    }

    return `Embedded ${pages.length} page(s)`;
  } finally {
    brain.close();
  }
}
