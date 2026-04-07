import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrainDatabase } from "../src/core/db";
import { buildServer, callTool, getToolDefinitions } from "../src/mcp/server";
import pkg from "../package.json";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

describe("getToolDefinitions", () => {
  it("declares the expected tool names", () => {
    const names = getToolDefinitions().map((tool) => tool.name);

    expect(names).toContain("brain_get");
    expect(names).toContain("brain_ingest");
    expect(names).toContain("brain_link");
    expect(names).toContain("brain_query");
  });

  it("keeps the MCP server version aligned with package.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-mcp-"));
    cleanup.push(dir);

    const server = await buildServer(join(dir, "brain.db"));

    expect(
      ((server.server as unknown) as { _serverInfo?: { version?: string } })._serverInfo?.version,
    ).toBe(pkg.version);

    await server.close();
  });

  it("preserves other raw sources when updating a single source", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-mcp-"));
    cleanup.push(dir);
    const dbPath = join(dir, "brain.db");
    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "people/pedro-franceschi",
        type: "person",
        title: "Pedro Franceschi",
        compiledTruth: "# Pedro Franceschi",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Pedro Franceschi", type: "person" }),
      });
      brain.replaceRawData("people/pedro-franceschi", [
        { source: "crustdata", data: '{"title":"CEO"}' },
        { source: "linkedin", data: '{"title":"Founder"}' },
      ]);
    } finally {
      brain.close();
    }

    await callTool(dbPath, "brain_raw", {
      slug: "people/pedro-franceschi",
      source: "crustdata",
      data: { title: "Chair" },
    });

    const verifyBrain = new BrainDatabase(dbPath);

    try {
      verifyBrain.initialize();
      const records = verifyBrain
        .listRawData()
        .filter((record) => record.slug === "people/pedro-franceschi");

      expect(records).toHaveLength(2);
      expect(records.find((record) => record.source === "crustdata")?.data).toBe('{"title":"Chair"}');
      expect(records.find((record) => record.source === "linkedin")?.data).toBe('{"title":"Founder"}');
    } finally {
      verifyBrain.close();
    }
  });

  it("rejects invalid raw payloads before storage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-mcp-"));
    cleanup.push(dir);
    const dbPath = join(dir, "brain.db");
    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "people/pedro-franceschi",
        type: "person",
        title: "Pedro Franceschi",
        compiledTruth: "# Pedro Franceschi",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Pedro Franceschi", type: "person" }),
      });
    } finally {
      brain.close();
    }

    await expect(
      callTool(dbPath, "brain_raw", {
        slug: "people/pedro-franceschi",
        source: "crustdata",
        data: "not json",
      }),
    ).rejects.toThrow("Raw data must be valid JSON");

    const verifyBrain = new BrainDatabase(dbPath);

    try {
      verifyBrain.initialize();
      expect(
        verifyBrain.listRawData().filter((record) => record.slug === "people/pedro-franceschi"),
      ).toHaveLength(0);
    } finally {
      verifyBrain.close();
    }
  });

  it("returns a clear error when reading raw data for a missing page", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-mcp-"));
    cleanup.push(dir);
    const dbPath = join(dir, "brain.db");
    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
    } finally {
      brain.close();
    }

    await expect(
      callTool(dbPath, "brain_raw", {
        slug: "people/missing",
      }),
    ).rejects.toThrow("Page not found: people/missing");
  });

  it("returns empty output when a page exists but has no raw data", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-mcp-"));
    cleanup.push(dir);
    const dbPath = join(dir, "brain.db");
    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "people/pedro-franceschi",
        type: "person",
        title: "Pedro Franceschi",
        compiledTruth: "# Pedro Franceschi",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Pedro Franceschi", type: "person" }),
      });
    } finally {
      brain.close();
    }

    expect(
      await callTool(dbPath, "brain_raw", {
        slug: "people/pedro-franceschi",
      }),
    ).toBe("");
  });

  it("supports structured brain_put updates and timeline appends", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-mcp-"));
    cleanup.push(dir);
    const dbPath = join(dir, "brain.db");

    await expect(
      callTool(dbPath, "brain_put", {
        slug: "people/pedro-franceschi",
        compiled_truth: "# Pedro Franceschi",
        timeline_append: "- **2026-04-05** | meeting — Met in SF",
        frontmatter: { title: "Pedro Franceschi", type: "person" },
      }),
    ).resolves.toBe("Saved people/pedro-franceschi");

    const output = await callTool(dbPath, "brain_get", { slug: "people/pedro-franceschi" });

    expect(output).toContain("# Pedro Franceschi");
    expect(output).toContain("- **2026-04-05** | meeting — Met in SF");
  });

  it("implements documented brain_link and brain_ingest tools", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-mcp-"));
    cleanup.push(dir);
    const dbPath = join(dir, "brain.db");
    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "people/pedro-franceschi",
        type: "person",
        title: "Pedro Franceschi",
        compiledTruth: "# Pedro Franceschi",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Pedro Franceschi", type: "person" }),
      });
      brain.upsertPage({
        slug: "companies/brex",
        type: "company",
        title: "Brex",
        compiledTruth: "# Brex",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Brex", type: "company" }),
      });
    } finally {
      brain.close();
    }

    await expect(
      callTool(dbPath, "brain_link", {
        from: "people/pedro-franceschi",
        to: "companies/brex",
        context: "founder",
      }),
    ).resolves.toBe("Linked people/pedro-franceschi -> companies/brex");

    await expect(
      callTool(dbPath, "brain_ingest", {
        content: "Meeting notes",
        source_ref: "notes/meeting-123.txt",
        source_type: "meeting",
      }),
    ).resolves.toContain("Ingested notes/meeting-123.txt");

    const verifyBrain = new BrainDatabase(dbPath);

    try {
      verifyBrain.initialize();
      expect(verifyBrain.backlinks("companies/brex")).toEqual(["people/pedro-franceschi"]);
      expect(
        verifyBrain.listPages({ type: "source", limit: 10 }).map((page) => page.compiledTruth),
      ).toContain("Meeting notes");
    } finally {
      verifyBrain.close();
    }
  });

  it("applies brain_list filters from the documented schema", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gbrain-mcp-"));
    cleanup.push(dir);
    const dbPath = join(dir, "brain.db");
    const brain = new BrainDatabase(dbPath);

    try {
      brain.initialize();
      brain.upsertPage({
        slug: "people/pedro-franceschi",
        type: "person",
        title: "Pedro Franceschi",
        compiledTruth: "# Pedro Franceschi",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Pedro Franceschi", type: "person" }),
      });
      brain.upsertPage({
        slug: "companies/brex",
        type: "company",
        title: "Brex",
        compiledTruth: "# Brex",
        timeline: "",
        frontmatter: JSON.stringify({ title: "Brex", type: "company" }),
      });
    } finally {
      brain.close();
    }

    const output = await callTool(dbPath, "brain_list", { type: "person", limit: 1 });

    expect(output).toContain("people/pedro-franceschi | person | Pedro Franceschi");
    expect(output).not.toContain("companies/brex");
  });
});
