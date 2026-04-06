import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrainDatabase } from "../src/core/db";
import {
  cosineSimilarity,
  decodeEmbedding,
  encodeEmbedding,
  mergeHybridResults,
  type EmbeddingProvider,
} from "../src/core/embeddings";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

describe("embeddings", () => {
  it("encodes and decodes float32 vectors losslessly", () => {
    const original = [1, 0, 0.5];
    const encoded = encodeEmbedding(original);
    const decoded = decodeEmbedding(encoded);

    expect(decoded).toEqual(original);
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("merges FTS and vector results by slug", () => {
    const merged = mergeHybridResults(
      [{ slug: "people/pedro", title: "Pedro", score: 0.5, excerpt: "Brex" }],
      [{ slug: "people/pedro", score: 0.7 }, { slug: "people/ilya", score: 0.6 }],
    );

    expect(merged[0]?.slug).toBe("people/pedro");
    expect(merged).toHaveLength(2);
  });

  it("stores embeddings and returns the best semantic match per page", async () => {
    const dir = createTempDir("gbrain-embeddings-");
    const brain = new BrainDatabase(join(dir, "brain.db"));
    const provider: EmbeddingProvider = {
      async embed(text: string): Promise<number[]> {
        return text.includes("agent") ? [1, 0] : [0, 1];
      },
    };

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "companies/river-ai",
        type: "company",
        title: "River AI",
        compiledTruth: "Agent infrastructure for developer workflows.",
        timeline: "",
        frontmatter: JSON.stringify({ title: "River AI", type: "company" }),
      });
      brain.upsertPage({
        slug: "concepts/notes",
        type: "concept",
        title: "Notes",
        compiledTruth: "General notes about founders.",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Notes", type: "concept" }),
      });

      brain.replaceEmbeddings("companies/river-ai", [
        { chunkText: "Agent infrastructure for developer workflows.", values: [1, 0] },
        { chunkText: "Secondary chunk.", values: [0.8, 0.2] },
      ]);
      brain.replaceEmbeddings("concepts/notes", [
        { chunkText: "General notes about founders.", values: [0, 1] },
      ]);

      const results = await brain.searchSemantic("agent systems", provider, 10);

      expect(results[0]?.slug).toBe("companies/river-ai");
      expect(results[0]?.score).toBeCloseTo(1, 5);
    } finally {
      brain.close();
    }
  });
});
