import { readFileSync } from "node:fs";
import { parseMarkdownDocument } from "../core/markdown";
import { BrainDatabase } from "../core/db";
import { PAGE_TYPES, type PageType } from "../core/types";

function extractPageType(value: unknown): PageType {
  if (typeof value !== "string" || !PAGE_TYPES.includes(value as PageType)) {
    throw new Error("Page frontmatter must include a valid type");
  }

  return value as PageType;
}

function extractTitle(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Page frontmatter must include a title");
  }

  return value;
}

export function runPutFromSource(dbPath: string, slug: string, source: string): string {
  const parsed = parseMarkdownDocument(source);
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    brain.upsertPage({
      slug,
      type: extractPageType(parsed.frontmatter.type),
      title: extractTitle(parsed.frontmatter.title),
      compiledTruth: parsed.compiledTruth,
      timeline: parsed.timeline,
      frontmatter: JSON.stringify(parsed.frontmatter),
    });

    return `Saved ${slug}`;
  } finally {
    brain.close();
  }
}

export function runPut(dbPath: string, slug: string, filePath: string): string {
  return runPutFromSource(dbPath, slug, readFileSync(filePath, "utf8"));
}
