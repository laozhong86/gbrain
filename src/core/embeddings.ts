import type { FtsResult } from "./fts";

export interface VectorSearchResult {
  slug: string;
  score: number;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export function createOpenAIEmbeddingProvider(apiKey: string): EmbeddingProvider {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for embedding commands");
  }

  return {
    async embed(text: string): Promise<number[]> {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
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
  const merged = new Map<string, number>();

  for (const result of ftsResults) {
    merged.set(result.slug, (merged.get(result.slug) ?? 0) + result.score * 0.4);
  }

  for (const result of vectorResults) {
    merged.set(result.slug, (merged.get(result.slug) ?? 0) + result.score * 0.6);
  }

  return [...merged.entries()]
    .map(([slug, score]) => ({ slug, score }))
    .sort((left, right) => right.score - left.score);
}
