export interface ExtractedLink {
  text: string;
  targetSlug: string;
  context: string;
}

const wikiLinkRegex = /\[([^\]]+)\]\(((?:\.\.\/)*[\w/-]+\.md)\)/g;

export function normalizeWikiTarget(target: string): string {
  return target.replace(/^(\.\.\/)+/, "").replace(/\.md$/, "");
}

export function slugToMarkdownPath(slug: string): string {
  return `${slug}.md`;
}

export function extractWikiLinks(markdown: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];

  for (const match of markdown.matchAll(wikiLinkRegex)) {
    links.push({
      text: match[1],
      targetSlug: normalizeWikiTarget(match[2]),
      context: markdown,
    });
  }

  return links;
}
