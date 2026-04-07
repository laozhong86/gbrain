import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestSessionTranscript, renderTranscript, shouldIngestSession } from "../hooks/gbrain-ingest-session/hook.js";

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
    const calls: Array<{ filePath: string; sourceRef: string }> = [];

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
        runIngest: (filePath: string, sourceRef: string) => {
          calls.push({ filePath, sourceRef });
        },
      },
    );

    expect(result).toEqual({
      ingested: true,
      filePath: join(outputDir, "gbrain-session-session-123.md"),
      sourceRef: "openclaw-session/session-123",
    });
    expect(calls).toEqual([
      {
        filePath: join(outputDir, "gbrain-session-session-123.md"),
        sourceRef: "openclaw-session/session-123",
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
});
