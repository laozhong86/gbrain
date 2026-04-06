import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BrainDatabase } from "../core/db";
import { slugToMarkdownPath } from "../core/links";
import { renderStoredMarkdownDocument } from "../core/markdown";

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

export async function runExport(dbPath: string, exportDir: string): Promise<string> {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const expectedFiles = new Set<string>();

    for (const page of brain.listPages({ limit: 100000 })) {
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
