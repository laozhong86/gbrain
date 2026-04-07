import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractMemoryItems,
  ingestSessionTranscript,
  renderExtractedMemoryPage,
  renderTranscript,
  shouldIngestSession,
  type OpenClawMessage,
} from "../hooks/gbrain-ingest-session/hook.js";

describe("OpenClaw integration assets", () => {
  it("ignores trivial sessions", async () => {
    expect(shouldIngestSession([])).toBe(false);
    expect(
      shouldIngestSession([
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ]),
    ).toBe(false);

    const result = await ingestSessionTranscript({
      session: {
        id: "tiny",
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
      },
    });

    expect(result).toEqual({ ingested: false, reason: "insufficient_messages" });
  });

  it("renders transcripts and forwards an explicit source ref to gbrain ingest", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "gbrain-openclaw-hook-"));
    const ingestCalls: Array<{ filePath: string; sourceRef: string; dbPath: string; binaryPath: string }> = [];
    const putCalls: Array<{ slug: string; markdown: string; dbPath: string; binaryPath: string }> = [];
    const linkCalls: Array<{ fromSlug: string; toSlug: string; dbPath: string; binaryPath: string }> = [];

    const result = await ingestSessionTranscript(
      {
        session: {
          id: "session-123",
          messages: [
            { role: "system", content: "ignore me" },
            { role: "user", content: "We met Jane Doe." },
            { role: "assistant", content: "Noted." },
            { role: "user", content: "Follow up next Tuesday." },
          ],
        },
      },
      {
        now: new Date("2026-04-07T00:00:00.000Z"),
        tmpDir: outputDir,
        dbPath: "/tmp/openclaw-brain.db",
        gbrainBin: "/tmp/custom-gbrain",
        runIngest: (filePath: string, sourceRef: string, dbPath: string, binaryPath: string) => {
          ingestCalls.push({ filePath, sourceRef, dbPath, binaryPath });
        },
        runPut: (slug: string, markdown: string, dbPath: string, binaryPath: string) => {
          putCalls.push({ slug, markdown, dbPath, binaryPath });
        },
        runLink: (fromSlug: string, toSlug: string, dbPath: string, binaryPath: string) => {
          linkCalls.push({ fromSlug, toSlug, dbPath, binaryPath });
        },
      },
    );

    expect(result).toEqual({
      ingested: true,
      filePath: join(outputDir, "gbrain-session-session-123.md"),
      sourceRef: "openclaw-session/session-123",
      dbPath: "/tmp/openclaw-brain.db",
      sourceSlug: "sources/session-123-2b2f418ae1",
      extractedSlug: "concepts/openclaw-session-memory-session-123",
      extracted: true,
    });
    expect(ingestCalls).toEqual([
      {
        filePath: join(outputDir, "gbrain-session-session-123.md"),
        sourceRef: "openclaw-session/session-123",
        dbPath: "/tmp/openclaw-brain.db",
        binaryPath: "/tmp/custom-gbrain",
      },
    ]);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]?.slug).toBe("concepts/openclaw-session-memory-session-123");
    expect(putCalls[0]?.dbPath).toBe("/tmp/openclaw-brain.db");
    expect(putCalls[0]?.binaryPath).toBe("/tmp/custom-gbrain");
    expect(putCalls[0]?.markdown).toContain("- We met Jane Doe.");
    expect(putCalls[0]?.markdown).toContain("- Follow up next Tuesday.");
    expect(linkCalls).toEqual([
      {
        fromSlug: "concepts/openclaw-session-memory-session-123",
        toSlug: "sources/session-123-2b2f418ae1",
        dbPath: "/tmp/openclaw-brain.db",
        binaryPath: "/tmp/custom-gbrain",
      },
    ]);
    expect(readFileSync(join(outputDir, "gbrain-session-session-123.md"), "utf8")).toBe(
      renderTranscript([
        { role: "system", content: "ignore me" },
        { role: "user", content: "We met Jane Doe." },
        { role: "assistant", content: "Noted." },
        { role: "user", content: "Follow up next Tuesday." },
      ], new Date("2026-04-07T00:00:00.000Z")),
    );
  });

  it("extracts durable user memory items into a structured page", () => {
    const messages: OpenClawMessage[] = [
      { role: "user", content: "记住 mango-1884 这个验证码。" },
      { role: "assistant", content: "收到。" },
      { role: "user", content: "下周二检查 GBrain session ingest。" },
      { role: "user", content: "/new" },
    ];

    expect(extractMemoryItems(messages)).toEqual([
      "记住 mango-1884 这个验证码。",
      "下周二检查 GBrain session ingest。",
    ]);

    const markdown = renderExtractedMemoryPage(
      "session-1884",
      "openclaw-session/session-1884",
      messages,
      new Date("2026-04-07T00:00:00.000Z"),
    );

    expect(markdown).toContain("title: OpenClaw Session Memory session-1884");
    expect(markdown).toContain("type: concept");
    expect(markdown).toContain("- 记住 mango-1884 这个验证码。");
    expect(markdown).toContain("- [ ] 下周二检查 GBrain session ingest。");
    expect(markdown).toContain("- **2026-04-07** | openclaw-session/session-1884 — Session memory extracted");
  });
});
