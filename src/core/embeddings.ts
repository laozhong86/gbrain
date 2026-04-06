import type { FtsResult } from "./fts";

export interface VectorSearchResult {
  slug: string;
  score: number;
  chunkText: string;
}

export interface EmbeddingProvider {
  model: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
}

export interface OpenAIEmbeddingProviderOptions {
  baseUrl?: string;
  dimensions?: number;
  model?: string;
}

export function createOpenAIEmbeddingProvider(
  apiKey: string,
  options: OpenAIEmbeddingProviderOptions = {},
): EmbeddingProvider {
  const fallbackApiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || "";
  const resolvedApiKey = apiKey || fallbackApiKey;

  if (!resolvedApiKey) {
    throw new Error(
      "OPENAI_API_KEY or OPENROUTER_API_KEY is required for embedding commands",
    );
  }

  const model = options.model ?? "text-embedding-3-small";
  const dimensions = options.dimensions ?? 1536;
  const usesOpenRouter =
    (!apiKey && !!process.env.OPENROUTER_API_KEY) ||
    (!!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY);
  const baseUrl =
    options.baseUrl ??
    process.env.EMBEDDING_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    (usesOpenRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1");

  return {
    model,
    dimensions,
    async embed(text: string): Promise<number[]> {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${resolvedApiKey}`,
      };

      if (baseUrl.includes("openrouter.ai")) {
        if (process.env.OPENROUTER_HTTP_REFERER) {
          headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
        }
        if (process.env.OPENROUTER_X_TITLE) {
          headers["X-Title"] = process.env.OPENROUTER_X_TITLE;
        }
      }

      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          dimensions,
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const embedding = payload.data?.[0]?.embedding;

      if (!embedding) {
        throw new Error("Embedding response did not include a vector");
      }

      return embedding;
    },
  };
}

export function encodeEmbedding(values: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

export function decodeEmbedding(bytes: Uint8Array): number[] {
  return Array.from(
    new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  );
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error("Embedding vectors must have the same length");
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! * left[index]!;
    rightNorm += right[index]! * right[index]!;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function mergeHybridResults(
  ftsResults: FtsResult[],
  vectorResults: VectorSearchResult[],
): Array<{ slug: string; score: number }> {
  const reciprocalRankBase = 60;
  const merged = new Map<string, number>();

  for (const [index, result] of ftsResults.entries()) {
    merged.set(
      result.slug,
      (merged.get(result.slug) ?? 0) + 1 / (reciprocalRankBase + index + 1),
    );
  }

  for (const [index, result] of vectorResults.entries()) {
    merged.set(
      result.slug,
      (merged.get(result.slug) ?? 0) + 1 / (reciprocalRankBase + index + 1),
    );
  }

  return [...merged.entries()]
    .map(([slug, score]) => ({ slug, score }))
    .sort((left, right) => right.score - left.score);
}
