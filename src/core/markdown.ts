import matter from "gray-matter";
import YAML from "yaml";

export interface ParsedMarkdownDocument {
  frontmatter: Record<string, unknown>;
  compiledTruth: string;
  timeline: string;
}

export function parseMarkdownDocument(source: string): ParsedMarkdownDocument {
  const parsed = matter(source);
  const separator = /\n---\n/;
  const matchIndex = parsed.content.search(separator);

  if (matchIndex === -1) {
    return {
      frontmatter: parsed.data,
      compiledTruth: parsed.content.trim(),
      timeline: "",
    };
  }

  return {
    frontmatter: parsed.data,
    compiledTruth: parsed.content.slice(0, matchIndex).trim(),
    timeline: parsed.content.slice(matchIndex + 5).trim(),
  };
}

export function renderMarkdownDocument(doc: ParsedMarkdownDocument): string {
  const yaml = YAML.stringify(doc.frontmatter).trimEnd();
  const body = doc.timeline
    ? `${doc.compiledTruth.trim()}\n\n---\n\n${doc.timeline.trim()}`
    : doc.compiledTruth.trim();

  return `---\n${yaml}\n---\n\n${body}\n`;
}

export function chunkPageContent(compiledTruth: string, timeline: string): string[] {
  const source = timeline
    ? `${compiledTruth.trim()}\n\n## Timeline\n\n${timeline.trim()}`
    : compiledTruth.trim();
  const sections = source
    .split(/\n(?=#{1,2}\s)/g)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.length > 0 ? sections : [source];
}
