import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runExport } from "../src/commands/export";
import { runImport } from "../src/commands/import";

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
});
