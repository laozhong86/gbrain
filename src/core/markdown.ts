import matter from "gray-matter";
import YAML from "yaml";

export interface ParsedMarkdownDocument {
  frontmatter: Record<string, unknown>;
  compiledTruth: string;
  timeline: string;
}

export type ChunkStrategy = "page" | "section" | "paragraph";

const TIMELINE_SPLIT_PATTERN = /\n---\n(?=\n*- \*\*\d{4}-\d{2}-\d{2}\*\*\s*\|)/;

export function parseMarkdownDocument(source: string): ParsedMarkdownDocument {
  const parsed = matter(source);
  const content = parsed.content.replace(/\r\n/g, "\n");
  const matchIndex = content.search(TIMELINE_SPLIT_PATTERN);

  if (matchIndex === -1) {
    return {
      frontmatter: parsed.data,
      compiledTruth: content.trim(),
      timeline: "",
    };
  }

  return {
    frontmatter: parsed.data,
    compiledTruth: content.slice(0, matchIndex).trim(),
    timeline: content.slice(matchIndex + 5).trim(),
  };
}

export function renderMarkdownDocument(doc: ParsedMarkdownDocument): string {
  const yaml = YAML.stringify(doc.frontmatter).trimEnd();
  const body = doc.timeline
    ? `${doc.compiledTruth.trim()}\n\n---\n\n${doc.timeline.trim()}`
    : doc.compiledTruth.trim();

  return `---\n${yaml}\n---\n\n${body}\n`;
}

export function parseStoredFrontmatter(
  slug: string,
  frontmatter: string,
): Record<string, unknown> {
  try {
    return JSON.parse(frontmatter) as Record<string, unknown>;
  } catch {
    throw new Error(`Stored frontmatter is invalid JSON for page: ${slug}`);
  }
}

export function renderStoredMarkdownDocument(
  slug: string,
  frontmatter: string,
  compiledTruth: string,
  timeline: string,
): string {
  return renderMarkdownDocument({
    frontmatter: parseStoredFrontmatter(slug, frontmatter),
    compiledTruth,
    timeline,
  });
}

export function isChunkStrategy(value: string): value is ChunkStrategy {
  return value === "page" || value === "section" || value === "paragraph";
}

export function chunkPageContent(
  compiledTruth: string,
  timeline: string,
  strategy: ChunkStrategy = "section",
): string[] {
  const source = timeline
    ? `${compiledTruth.trim()}\n\n## Timeline\n\n${timeline.trim()}`
    : compiledTruth.trim();

  if (strategy === "page") {
    return source.length > 0 ? [source] : [];
  }

  const chunks = source
    .split(strategy === "paragraph" ? /\n\s*\n+/g : /\n(?=#{1,2}\s)/g)
    .map((section) => section.trim())
    .filter(Boolean);

  return chunks.length > 0 ? chunks : (source.length > 0 ? [source] : []);
}
