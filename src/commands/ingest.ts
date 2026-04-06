import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { BrainDatabase } from "../core/db";

export function runIngest(dbPath: string, filePath: string, sourceType: string): string {
  const brain = new BrainDatabase(dbPath);
  const content = readFileSync(filePath, "utf8").trim();
  const baseName = basename(filePath).replace(/\.[^.]+$/, "");
  const normalizedPath = resolve(filePath).replace(/\\/g, "/");
  const slugSuffix = createHash("sha1").update(normalizedPath).digest("hex").slice(0, 10);
  const slug = `sources/${baseName}-${slugSuffix}`;

  try {
    brain.initialize();
    brain.upsertPage({
      slug,
      type: "source",
      title: baseName,
      compiledTruth: content,
      timeline: "",
      frontmatter: JSON.stringify({ title: baseName, type: "source" }),
    });
    brain.appendIngestLog(sourceType, filePath, [slug], `Ingested ${filePath}`);
    return `Ingested ${filePath}`;
  } finally {
    brain.close();
  }
}
