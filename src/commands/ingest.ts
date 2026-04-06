import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { BrainDatabase } from "../core/db";

export function runIngest(dbPath: string, filePath: string, sourceType: string): string {
  const brain = new BrainDatabase(dbPath);
  const content = readFileSync(filePath, "utf8").trim();
  const baseName = basename(filePath).replace(/\.[^.]+$/, "");
  const slug = `sources/${baseName}`;

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
