import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { BrainDatabase } from "../core/db";
import { extractWikiLinks, normalizeWikiTarget, slugToMarkdownPath } from "../core/links";
import { parseMarkdownDocument } from "../core/markdown";
import { isPageType, type PageType } from "../core/types";

const SKIPPED_MARKDOWN_FILES = new Set(["schema.md", "index.md", "log.md", "README.md"]);

const TYPE_BY_DIRECTORY: Record<string, PageType> = {
  people: "person",
  companies: "company",
  deals: "deal",
  yc: "yc",
  civic: "civic",
  projects: "project",
  concepts: "concept",
  sources: "source",
  media: "media",
  meetings: "source",
  programs: "source",
};

function scanMarkdownFiles(rootDir: string): string[] {
  const output: string[] = [];

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name === ".raw") {
      continue;
    }

    const fullPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      output.push(...scanMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md") && !SKIPPED_MARKDOWN_FILES.has(entry.name)) {
      output.push(fullPath);
    }
  }

  return output.sort();
}

function extractPageType(slug: string, value: unknown): PageType {
  if (typeof value === "string" && isPageType(value)) {
    return value;
  }

  const topLevelDir = slug.split("/")[0];
  const fallbackType = TYPE_BY_DIRECTORY[topLevelDir];

  if (!fallbackType) {
    throw new Error(`Page frontmatter must include a valid type for ${slug}`);
  }

  return fallbackType;
}

function readOptionalSpecialFile(sourceDir: string, fileName: string): string | null {
  try {
    return readFileSync(join(sourceDir, fileName), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function parseLogSummaries(source: string): string[] {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith("- ") ? line.slice(2).trim() : line));
}

function extractTitle(slug: string, value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  return slug.split("/").pop() ?? slug;
}

function extractTags(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Page frontmatter tags must be a list of strings");
  }

  return value.map((tag) => {
    if (typeof tag !== "string") {
      throw new Error("Page frontmatter tags must be a list of strings");
    }

    return tag;
  });
}

function readSidecarSources(sourceDir: string, filePath: string): Array<{ source: string; data: string }> {
  const relativePath = relative(sourceDir, filePath).replace(/\\/g, "/");
  const slug = normalizeWikiTarget(slugToMarkdownPath(normalizeWikiTarget(relativePath)));
  const segments = slug.split("/");
  const fileName = segments.pop();

  if (!fileName) {
    return [];
  }

  const sidecarPath = join(sourceDir, ...segments, ".raw", `${fileName}.json`);

  try {
    const parsed = JSON.parse(readFileSync(sidecarPath, "utf8")) as { sources?: Record<string, unknown> };

    return Object.entries(parsed.sources ?? {}).map(([source, data]) => ({
      source,
      data: JSON.stringify(data),
    }));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function runImport(
  dbPath: string,
  sourceDir: string,
  withEmbeddings: boolean,
): Promise<string> {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();

    const files = scanMarkdownFiles(sourceDir);
    const specialFiles = {
      index: readOptionalSpecialFile(sourceDir, "index.md"),
      log: readOptionalSpecialFile(sourceDir, "log.md"),
      schema: readOptionalSpecialFile(sourceDir, "schema.md"),
    };
    const importedPages = files.map((filePath) => ({
      filePath,
      slug: normalizeWikiTarget(relative(sourceDir, filePath).replace(/\\/g, "/")),
    }));
    const linksBySlug = new Map<string, Array<{ targetSlug: string; context: string }>>();

    brain.transaction(() => {
      brain.deletePagesNotIn(importedPages.map((page) => page.slug));

      for (const importedPage of importedPages) {
        const parsed = parseMarkdownDocument(readFileSync(importedPage.filePath, "utf8"));

        brain.upsertPage({
          slug: importedPage.slug,
          type: extractPageType(importedPage.slug, parsed.frontmatter.type),
          title: extractTitle(importedPage.slug, parsed.frontmatter.title),
          compiledTruth: parsed.compiledTruth,
          timeline: parsed.timeline,
          frontmatter: JSON.stringify(parsed.frontmatter),
        });

        brain.replaceTags(importedPage.slug, extractTags(parsed.frontmatter.tags));
        brain.replaceRawData(importedPage.slug, readSidecarSources(sourceDir, importedPage.filePath));
        linksBySlug.set(
          importedPage.slug,
          extractWikiLinks(`${parsed.compiledTruth}\n${parsed.timeline}`).map((link) => ({
            targetSlug: link.targetSlug,
            context: link.context,
          })),
        );
      }

      for (const importedPage of importedPages) {
        brain.replaceOutgoingLinks(importedPage.slug, linksBySlug.get(importedPage.slug) ?? []);
      }

      if (specialFiles.index === null) {
        brain.deleteConfig("original_index");
      } else {
        brain.setConfig("original_index", specialFiles.index);
      }

      if (specialFiles.schema === null) {
        brain.deleteConfig("original_schema");
      } else {
        brain.setConfig("original_schema", specialFiles.schema);
      }

      if (specialFiles.log === null) {
        brain.deleteConfig("original_log");
        brain.replaceImportedLog("log.md", []);
      } else {
        brain.setConfig("original_log", specialFiles.log);
        brain.replaceImportedLog("log.md", parseLogSummaries(specialFiles.log));
      }
    });

    return withEmbeddings
      ? `Imported ${files.length} pages with embeddings pending`
      : `Imported ${files.length} pages`;
  } finally {
    brain.close();
  }
}
