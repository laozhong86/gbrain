import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrainDatabase } from "../src/core/db";
import { runEmbed } from "../src/commands/embed";
import { runQuery } from "../src/commands/query";
import {
  cosineSimilarity,
  createOpenAIEmbeddingProvider,
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
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.EMBEDDING_BASE_URL;
  delete process.env.OPENROUTER_HTTP_REFERER;
  delete process.env.OPENROUTER_X_TITLE;
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
      [
        { slug: "people/pedro", score: 0.7, chunkText: "Pedro founded Brex" },
        { slug: "people/ilya", score: 0.6, chunkText: "Ilya built semantic systems" },
      ],
    );

    expect(merged[0]?.slug).toBe("people/pedro");
    expect(merged).toHaveLength(2);
  });

  it("uses rank fusion so lexical and semantic winners both influence hybrid order", () => {
    const merged = mergeHybridResults(
      [
        { slug: "pages/lexical", title: "Lexical", score: 100, excerpt: "keyword" },
        { slug: "pages/blended", title: "Blended", score: 0.01, excerpt: "secondary" },
      ],
      [
        { slug: "pages/blended", score: 0.91, chunkText: "semantic blended hit" },
        { slug: "pages/semantic", score: 0.9, chunkText: "semantic only hit" },
      ],
    );

    expect(merged[0]?.slug).toBe("pages/blended");
    expect(merged[1]?.slug).toBe("pages/lexical");
    expect(merged[2]?.slug).toBe("pages/semantic");
  });

  it("stores embeddings and returns the best semantic match per page", async () => {
    const dir = createTempDir("gbrain-embeddings-");
    const brain = new BrainDatabase(join(dir, "brain.db"));
    const provider: EmbeddingProvider = {
      model: "test-small",
      dimensions: 2,
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

      brain.replaceEmbeddings(
        "companies/river-ai",
        [
          { chunkText: "Agent infrastructure for developer workflows.", values: [1, 0] },
          { chunkText: "Secondary chunk.", values: [0.8, 0.2] },
        ],
        provider,
      );
      brain.replaceEmbeddings(
        "concepts/notes",
        [{ chunkText: "General notes about founders.", values: [0, 1] }],
        provider,
      );

      const results = await brain.searchSemantic("agent systems", provider, 10);

      expect(results[0]?.slug).toBe("companies/river-ai");
      expect(results[0]?.score).toBeCloseTo(1, 5);
      expect(results[0]?.chunkText).toContain("Agent infrastructure");
    } finally {
      brain.close();
    }
  });

  it("filters stored embeddings that do not match the active model or dimensions", async () => {
    const dir = createTempDir("gbrain-embedding-filter-");
    const brain = new BrainDatabase(join(dir, "brain.db"));
    const provider: EmbeddingProvider = {
      model: "model-a",
      dimensions: 2,
      async embed(): Promise<number[]> {
        return [1, 0];
      },
    };

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "pages/valid",
        type: "concept",
        title: "Valid",
        compiledTruth: "valid chunk",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Valid", type: "concept" }),
      });
      brain.upsertPage({
        slug: "pages/other-model",
        type: "concept",
        title: "Other Model",
        compiledTruth: "other model chunk",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Other Model", type: "concept" }),
      });
      brain.upsertPage({
        slug: "pages/wrong-dimensions",
        type: "concept",
        title: "Wrong Dimensions",
        compiledTruth: "wrong dimensions chunk",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Wrong Dimensions", type: "concept" }),
      });

      brain.replaceEmbeddings("pages/valid", [{ chunkText: "valid chunk", values: [1, 0] }], provider);

      const otherModelId = brain.getPageBySlug("pages/other-model")?.id;
      const wrongDimensionsId = brain.getPageBySlug("pages/wrong-dimensions")?.id;

      expect(otherModelId).toBeDefined();
      expect(wrongDimensionsId).toBeDefined();

      brain.db
        .query(
          `INSERT INTO page_embeddings (page_id, chunk_index, chunk_text, embedding, model)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .run(otherModelId!, 0, "other model chunk", encodeEmbedding([1, 0]), "model-b");
      brain.db
        .query(
          `INSERT INTO page_embeddings (page_id, chunk_index, chunk_text, embedding, model)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .run(wrongDimensionsId!, 0, "wrong dimensions chunk", encodeEmbedding([1, 0, 0]), "model-a");

      const results = await brain.searchSemantic("question", provider, 10);

      expect(results.map((result) => result.slug)).toEqual(["pages/valid"]);
    } finally {
      brain.close();
    }
  });

  it("rejects embeddings that do not match provider dimensions on write", async () => {
    const dir = createTempDir("gbrain-embedding-validate-");
    const brain = new BrainDatabase(join(dir, "brain.db"));
    const provider: EmbeddingProvider = {
      model: "test-small",
      dimensions: 2,
      async embed(): Promise<number[]> {
        return [1, 0, 0];
      },
    };

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "pages/example",
        type: "concept",
        title: "Example",
        compiledTruth: "# Example\n\nChunk body.",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Example", type: "concept" }),
      });

      await expect(runEmbed(brain.dbPath, "pages/example", provider)).rejects.toThrow(
        "Embedding dimensions mismatch",
      );
    } finally {
      brain.close();
    }
  });

  it("query output surfaces the matched semantic chunk text", async () => {
    const dir = createTempDir("gbrain-query-output-");
    const dbPath = join(dir, "brain.db");
    const provider: EmbeddingProvider = {
      model: "test-small",
      dimensions: 2,
      async embed(text: string): Promise<number[]> {
        return text.includes("semantic needle") ? [1, 0] : [0, 1];
      },
    };

    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "pages/chunked",
        type: "concept",
        title: "Chunked",
        compiledTruth: "# Chunked\n\n## Context\n\nBoring intro.\n\n## Deep Match\n\nsemantic needle appears here",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Chunked", type: "concept" }),
      });
      brain.replaceEmbeddings(
        "pages/chunked",
        [
          { chunkText: "# Chunked\n\n## Context\n\nBoring intro.", values: [0, 1] },
          { chunkText: "## Deep Match\n\nsemantic needle appears here", values: [1, 0] },
        ],
        provider,
      );
    } finally {
      brain.close();
    }

    const output = await runQuery(dbPath, "semantic needle", provider);

    expect(output).toContain("pages/chunked");
    expect(output).toContain("semantic needle appears here");
    expect(output).not.toContain("Boring intro.");
  });

  it("supports OpenRouter-compatible embedding requests", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-key";
    process.env.OPENROUTER_HTTP_REFERER = "https://example.com";
    process.env.OPENROUTER_X_TITLE = "GBrain Test";

    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });

      return new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2] }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    try {
      const provider = createOpenAIEmbeddingProvider("", {
        model: "openai/text-embedding-3-small",
        dimensions: 2,
      });
      const embedding = await provider.embed("hello");

      expect(embedding).toEqual([0.1, 0.2]);
      expect(requests[0]?.url).toBe("https://openrouter.ai/api/v1/embeddings");
      expect(requests[0]?.init?.headers).toMatchObject({
        authorization: "Bearer openrouter-test-key",
        "HTTP-Referer": "https://example.com",
        "X-Title": "GBrain Test",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("supports custom OpenAI-compatible embedding base URLs", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1";

    const originalFetch = globalThis.fetch;
    const requests: string[] = [];

    globalThis.fetch = (async (url: string | URL | Request) => {
      requests.push(String(url));

      return new Response(
        JSON.stringify({
          data: [{ embedding: [0.3, 0.4] }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    try {
      const provider = createOpenAIEmbeddingProvider("", {
        model: "text-embedding-3-small",
        dimensions: 2,
      });
      const embedding = await provider.embed("hello");

      expect(embedding).toEqual([0.3, 0.4]);
      expect(requests).toEqual(["https://openrouter.ai/api/v1/embeddings"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
