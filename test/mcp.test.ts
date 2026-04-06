import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrainDatabase } from "../src/core/db";
import { callTool, getToolDefinitions } from "../src/mcp/server";

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
    expect(names).toContain("brain_query");
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
      data: '{"title":"Chair"}',
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
});
