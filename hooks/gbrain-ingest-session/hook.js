import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function toDateString(now) {
  return now.toISOString().slice(0, 10);
}

export function shouldIngestSession(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }

  const userMessages = messages.filter((message) => message?.role === "user");
  return userMessages.length >= 2;
}

export function renderTranscript(messages, now = new Date()) {
  const lines = [`# Session Transcript - ${toDateString(now)}`, ""];

  for (const message of messages) {
    if (!message || message.role === "system" || typeof message.content !== "string") {
      continue;
    }

    const label = message.role === "user" ? "**User**" : "**Assistant**";
    lines.push(`${label}: ${message.content.trim()}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function ingestSessionTranscript(event, options = {}) {
  const messages = event?.session?.messages ?? [];

  if (!shouldIngestSession(messages)) {
    return { ingested: false, reason: "insufficient_messages" };
  }

  const now = options.now ?? new Date();
  const sessionId = event?.session?.id ?? `session-${now.getTime()}`;
  const transcript = renderTranscript(messages, now);
  const directory = options.tmpDir ?? tmpdir();
  const filePath = join(directory, `gbrain-session-${sessionId}.md`);
  const sourceRef = `openclaw-session/${sessionId}`;
  const writeTextFile = options.writeTextFile ?? ((path, text) => writeFileSync(path, text, "utf8"));
  const runIngest = options.runIngest
    ?? ((path, ref) => {
      execFileSync("gbrain", ["ingest", path, "--type", "conversation", "--ref", ref], {
        stdio: "ignore",
      });
    });

  mkdirSync(directory, { recursive: true });
  writeTextFile(filePath, transcript);

  try {
    runIngest(filePath, sourceRef);
    return { ingested: true, filePath, sourceRef };
  } catch {
    return { ingested: false, reason: "ingest_failed", filePath, sourceRef };
  }
}

export default async function handler(event) {
  await ingestSessionTranscript(event);
}
