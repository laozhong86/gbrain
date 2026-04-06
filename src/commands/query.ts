import { BrainDatabase } from "../core/db";
import { mergeHybridResults, type EmbeddingProvider } from "../core/embeddings";
import { searchFTS } from "../core/fts";

export async function runQuery(
  dbPath: string,
  question: string,
  provider: EmbeddingProvider,
): Promise<string> {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();

    const ftsResults = searchFTS(brain.db, question, 10);
    const vectorResults = await brain.searchSemantic(question, provider, 10);
    const merged = mergeHybridResults(ftsResults, vectorResults).slice(0, 10);
    const vectorResultsBySlug = new Map(vectorResults.map((result) => [result.slug, result]));
    const ftsResultsBySlug = new Map(ftsResults.map((result) => [result.slug, result]));

    return merged
      .map((result) => {
        const semanticMatch = vectorResultsBySlug.get(result.slug);
        const lexicalMatch = ftsResultsBySlug.get(result.slug);
        const page = brain.getPageBySlug(result.slug);
        const preview =
          semanticMatch?.chunkText ??
          lexicalMatch?.excerpt ??
          page?.compiledTruth.split("\n").slice(0, 4).join("\n") ??
          "";

        return `${result.slug} (score: ${result.score.toFixed(4)})\n${preview}`.trimEnd();
      })
      .join("\n\n");
  } finally {
    brain.close();
  }
}
