import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { BrainDatabase } from "../core/db";

export interface IngestInput {
  content: string;
  sourceRef: string;
  sourceType: string;
}

function toSourceTitle(sourceRef: string): string {
  const value = basename(sourceRef).replace(/\.[^.]+$/, "").trim();
  return value.length > 0 ? value : "source";
}

function toSourceSlugBase(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "source";
}

export function runIngestContent(dbPath: string, input: IngestInput): string {
  const brain = new BrainDatabase(dbPath);
  const content = input.content.trim();
  const title = toSourceTitle(input.sourceRef);
  const normalizedRef = input.sourceRef.replace(/\\/g, "/").trim();
  const slugSuffix = createHash("sha1").update(normalizedRef).digest("hex").slice(0, 10);
  const slug = `sources/${toSourceSlugBase(title)}-${slugSuffix}`;

  try {
    brain.initialize();
    brain.upsertPage({
      slug,
      type: "source",
      title,
      compiledTruth: content,
      timeline: "",
      frontmatter: JSON.stringify({ title, type: "source" }),
    });
    brain.appendIngestLog(input.sourceType, input.sourceRef, [slug], `Ingested ${input.sourceRef}`);
    return `Ingested ${input.sourceRef}`;
  } finally {
    brain.close();
  }
}

export function runIngest(
  dbPath: string,
  filePath: string,
  sourceType: string,
  sourceRef?: string,
): string {
  return runIngestContent(dbPath, {
    content: readFileSync(filePath, "utf8"),
    sourceRef: sourceRef ?? resolve(filePath),
    sourceType,
  });
}
