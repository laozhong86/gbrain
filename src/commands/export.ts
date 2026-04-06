import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BrainDatabase } from "../core/db";
import { slugToMarkdownPath } from "../core/links";
import { renderStoredMarkdownDocument } from "../core/markdown";
// @ts-expect-error Bun bundles .sql text imports for the compiled binary.
import schemaSql from "../schema.sql" with { type: "text" };

function rawSidecarPathForSlug(exportDir: string, slug: string): string {
  const segments = slug.split("/");
  const fileName = segments.pop();

  if (!fileName) {
    throw new Error(`Invalid slug: ${slug}`);
  }

  return join(exportDir, ...segments, ".raw", `${fileName}.json`);
}

function listManagedExportFiles(rootDir: string): string[] {
  const output: string[] = [];

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      output.push(...listManagedExportFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (entry.name.endsWith(".md")) {
      output.push(fullPath);
      continue;
    }

    if (entry.name.endsWith(".json") && fullPath.split(/[\\/]/).includes(".raw")) {
      output.push(fullPath);
    }
  }

  return output;
}

function renderIndexMarkdown(pages: Array<{ slug: string; type: string; title: string }>): string {
  const sections = new Map<string, Array<{ slug: string; title: string }>>();

  for (const page of pages) {
    const pagesForType = sections.get(page.type) ?? [];
    pagesForType.push({ slug: page.slug, title: page.title });
    sections.set(page.type, pagesForType);
  }

  const lines = ["# Index", ""];

  for (const type of [...sections.keys()].sort()) {
    lines.push(`## ${type}`);
    lines.push("");

    for (const page of sections.get(type) ?? []) {
      lines.push(`- ${page.slug} | ${page.title}`);
    }

    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderLogMarkdown(
  entries: Array<{ timestamp: string; sourceType: string; sourceRef: string; summary: string }>,
): string {
  const lines = ["# Log", ""];

  for (const entry of entries) {
    lines.push(`- ${entry.timestamp} | ${entry.sourceType} | ${entry.sourceRef} | ${entry.summary}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export async function runExport(dbPath: string, exportDir: string): Promise<string> {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const expectedFiles = new Set<string>();
    const pages = brain.listPages({ limit: 100000 });

    for (const page of pages) {
      const outputPath = join(exportDir, slugToMarkdownPath(page.slug));
      expectedFiles.add(outputPath);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(
        outputPath,
        renderStoredMarkdownDocument(
          page.slug,
          page.frontmatter,
          page.compiledTruth,
          page.timeline,
        ),
      );
    }

    const rawBySlug = new Map<string, Record<string, unknown>>();

    for (const record of brain.listRawData()) {
      const current = rawBySlug.get(record.slug) ?? {};
      current[record.source] = JSON.parse(record.data) as unknown;
      rawBySlug.set(record.slug, current);
    }

    for (const [slug, sources] of rawBySlug) {
      const outputPath = rawSidecarPathForSlug(exportDir, slug);
      expectedFiles.add(outputPath);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify({ sources }, null, 2));
    }

    const schemaPath = join(exportDir, "schema.md");
    const indexPath = join(exportDir, "index.md");
    const logPath = join(exportDir, "log.md");
    expectedFiles.add(schemaPath);
    expectedFiles.add(indexPath);
    expectedFiles.add(logPath);
    mkdirSync(exportDir, { recursive: true });
    writeFileSync(schemaPath, brain.getConfig("original_schema") ?? `${schemaSql.trim()}\n`);
    writeFileSync(indexPath, renderIndexMarkdown(pages));
    writeFileSync(
      logPath,
      renderLogMarkdown(
        brain.listIngestLog().map((entry) => ({
          timestamp: entry.timestamp,
          sourceType: entry.sourceType,
          sourceRef: entry.sourceRef,
          summary: entry.summary,
        })),
      ),
    );

    try {
      for (const filePath of listManagedExportFiles(exportDir)) {
        if (!expectedFiles.has(filePath)) {
          rmSync(filePath, { force: true });
        }
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }

    return `Exported to ${exportDir}`;
  } finally {
    brain.close();
  }
}
