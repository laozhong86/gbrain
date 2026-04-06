import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runExport } from "../src/commands/export";
import { runImport } from "../src/commands/import";
import { runBacklinks } from "../src/commands/link";
import { BrainDatabase } from "../src/core/db";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("runImport and runExport", () => {
  it("round-trips markdown pages and raw sidecars", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-roundtrip-"));
    dirs.push(dir);

    const sourceDir = join(dir, "brain");
    mkdirSync(join(sourceDir, "people", ".raw"), { recursive: true });

    writeFileSync(
      join(sourceDir, "people", "pedro-franceschi.md"),
      `---
title: Pedro Franceschi
type: person
tags:
  - founder
---

# Pedro Franceschi

## State

Brex founder.

---

- **2026-04-05** | meeting — Met in SF.
`,
    );
    writeFileSync(
      join(sourceDir, "people", ".raw", "pedro-franceschi.json"),
      JSON.stringify({ sources: { crustdata: { title: "CEO" } } }, null, 2),
    );

    const dbPath = join(dir, "brain.db");
    const exportDir = join(dir, "export");

    expect(await runImport(dbPath, sourceDir, false)).toBe("Imported 1 pages");
    expect(await runExport(dbPath, exportDir)).toBe(`Exported to ${exportDir}`);

    expect(readFileSync(join(exportDir, "people", "pedro-franceschi.md"), "utf8")).toContain(
      "Brex founder.",
    );
    expect(
      readFileSync(join(exportDir, "people", ".raw", "pedro-franceschi.json"), "utf8"),
    ).toContain('"crustdata"');
  });

  it("replaces stale sidecar sources on re-import", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-reimport-"));
    dirs.push(dir);

    const sourceDir = join(dir, "brain");
    const rawDir = join(sourceDir, "people", ".raw");
    mkdirSync(rawDir, { recursive: true });

    writeFileSync(
      join(sourceDir, "people", "pedro-franceschi.md"),
      `---
title: Pedro Franceschi
type: person
---

# Pedro Franceschi
`,
    );
    writeFileSync(
      join(rawDir, "pedro-franceschi.json"),
      JSON.stringify(
        {
          sources: {
            crustdata: { title: "CEO" },
            linkedin: { title: "Founder" },
          },
        },
        null,
        2,
      ),
    );

    const dbPath = join(dir, "brain.db");
    const exportDir = join(dir, "export");

    await runImport(dbPath, sourceDir, false);

    writeFileSync(
      join(rawDir, "pedro-franceschi.json"),
      JSON.stringify({ sources: { linkedin: { title: "Founder" } } }, null, 2),
    );

    await runImport(dbPath, sourceDir, false);
    await runExport(dbPath, exportDir);

    const sidecar = readFileSync(join(exportDir, "people", ".raw", "pedro-franceschi.json"), "utf8");

    expect(sidecar).toContain('"linkedin"');
    expect(sidecar).not.toContain('"crustdata"');
  });

  it("deletes pages removed from the source directory on re-import", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-delete-page-"));
    dirs.push(dir);

    const sourceDir = join(dir, "brain");
    mkdirSync(join(sourceDir, "people"), { recursive: true });

    const pedroPath = join(sourceDir, "people", "pedro-franceschi.md");
    const henriquePath = join(sourceDir, "people", "henrique-dubugras.md");

    writeFileSync(
      pedroPath,
      `---
title: Pedro Franceschi
type: person
---

# Pedro Franceschi
`,
    );
    writeFileSync(
      henriquePath,
      `---
title: Henrique Dubugras
type: person
---

# Henrique Dubugras
`,
    );

    const dbPath = join(dir, "brain.db");

    await runImport(dbPath, sourceDir, false);
    unlinkSync(henriquePath);
    await runImport(dbPath, sourceDir, false);

    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      expect(brain.getPageBySlug("people/pedro-franceschi")?.title).toBe("Pedro Franceschi");
      expect(brain.getPageBySlug("people/henrique-dubugras")).toBeNull();
    } finally {
      brain.close();
    }
  });

  it("removes stale outgoing links when markdown links are removed on re-import", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-delete-link-"));
    dirs.push(dir);

    const sourceDir = join(dir, "brain");
    mkdirSync(join(sourceDir, "people"), { recursive: true });
    mkdirSync(join(sourceDir, "companies"), { recursive: true });

    writeFileSync(
      join(sourceDir, "people", "pedro-franceschi.md"),
      `---
title: Pedro Franceschi
type: person
---

# Pedro Franceschi

Mentions [Brex](../companies/brex.md).
`,
    );
    writeFileSync(
      join(sourceDir, "companies", "brex.md"),
      `---
title: Brex
type: company
---

# Brex
`,
    );

    const dbPath = join(dir, "brain.db");

    await runImport(dbPath, sourceDir, false);
    expect(runBacklinks(dbPath, "companies/brex")).toBe("people/pedro-franceschi");

    writeFileSync(
      join(sourceDir, "people", "pedro-franceschi.md"),
      `---
title: Pedro Franceschi
type: person
---

# Pedro Franceschi

No company link now.
`,
    );

    await runImport(dbPath, sourceDir, false);
    expect(runBacklinks(dbPath, "companies/brex")).toBe("");
  });

  it("removes stale exported raw files on re-export", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-stale-export-"));
    dirs.push(dir);

    const sourceDir = join(dir, "brain");
    const rawDir = join(sourceDir, "people", ".raw");
    mkdirSync(rawDir, { recursive: true });

    writeFileSync(
      join(sourceDir, "people", "pedro-franceschi.md"),
      `---
title: Pedro Franceschi
type: person
---

# Pedro Franceschi
`,
    );
    writeFileSync(
      join(rawDir, "pedro-franceschi.json"),
      JSON.stringify({ sources: { crustdata: { title: "CEO" } } }, null, 2),
    );

    const dbPath = join(dir, "brain.db");
    const exportDir = join(dir, "export");
    const staleRawPath = join(exportDir, "people", ".raw", "orphan.json");

    await runImport(dbPath, sourceDir, false);
    await runExport(dbPath, exportDir);

    mkdirSync(join(exportDir, "people", ".raw"), { recursive: true });
    writeFileSync(staleRawPath, JSON.stringify({ stale: true }, null, 2));

    await runExport(dbPath, exportDir);

    expect(existsSync(join(exportDir, "people", ".raw", "pedro-franceschi.json"))).toBe(true);
    expect(existsSync(staleRawPath)).toBe(false);
  });
});
