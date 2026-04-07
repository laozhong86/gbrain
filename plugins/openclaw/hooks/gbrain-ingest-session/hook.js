import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const schemaSql = readFileSync(new URL("../../schema.sql", import.meta.url), "utf8");
const TIMELINE_ENTRY_PATTERN = /^- \*\*(\d{4}-\d{2}-\d{2})\*\*\s*\|\s*(.*?)\s+(?:—|-)\s+(.*)$/;

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

function extractMessageText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const textPart = content.find((part) => part?.type === "text" && typeof part.text === "string");
    return textPart?.text ?? "";
  }

  return "";
}

function readSessionMessagesFromFile(sessionFilePath, messageCount = 20) {
  try {
    const raw = readFileSync(sessionFilePath, "utf8").trim();

    if (raw.length === 0) {
      return [];
    }

    const messages = [];

    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) {
        continue;
      }

      try {
        const entry = JSON.parse(line);
        const message = entry?.message;
        const role = message?.role;

        if ((role !== "user" && role !== "assistant") || !message) {
          continue;
        }

        const text = extractMessageText(message.content).trim();

        if (text.length === 0 || text.startsWith("/")) {
          continue;
        }

        messages.push({ role, content: text });
      } catch {
        continue;
      }
    }

    return messages.slice(-messageCount);
  } catch {
    return [];
  }
}

function stripResetSuffix(fileName) {
  const resetIndex = fileName.indexOf(".reset.");
  return resetIndex === -1 ? fileName : fileName.slice(0, resetIndex);
}

function findPreviousSessionFile(sessionsDir, currentSessionFile, sessionId) {
  try {
    const files = readdirSync(sessionsDir);
    const fileSet = new Set(files);
    const baseFromReset = currentSessionFile ? stripResetSuffix(basename(currentSessionFile)) : undefined;

    if (baseFromReset && fileSet.has(baseFromReset)) {
      return join(sessionsDir, baseFromReset);
    }

    const trimmedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";

    if (trimmedSessionId.length > 0) {
      const canonicalFile = `${trimmedSessionId}.jsonl`;

      if (fileSet.has(canonicalFile)) {
        return join(sessionsDir, canonicalFile);
      }

      const topicVariants = files
        .filter((name) => name.startsWith(`${trimmedSessionId}-topic-`) && name.endsWith(".jsonl") && !name.includes(".reset."))
        .sort()
        .reverse();

      if (topicVariants.length > 0) {
        return join(sessionsDir, topicVariants[0]);
      }
    }

    const nonResetJsonl = files.filter((name) => name.endsWith(".jsonl") && !name.includes(".reset.")).sort().reverse();

    if (nonResetJsonl.length > 0) {
      return join(sessionsDir, nonResetJsonl[0]);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveMessagesFromCommandEvent(event, options = {}) {
  if (event?.type !== "command" || (event.action !== "new" && event.action !== "reset")) {
    return { messages: [], sessionId: undefined };
  }

  const context = event.context ?? {};
  const sessionEntry = context.previousSessionEntry ?? context.sessionEntry ?? {};
  let sessionFile = typeof sessionEntry.sessionFile === "string" ? sessionEntry.sessionFile : undefined;
  const sessionId = typeof sessionEntry.sessionId === "string"
    ? sessionEntry.sessionId
    : typeof event.sessionKey === "string" ? event.sessionKey : undefined;

  if (sessionFile && sessionFile.includes(".reset.")) {
    const recovered = findPreviousSessionFile(dirname(sessionFile), sessionFile, sessionId);

    if (recovered) {
      sessionFile = recovered;
    }
  }

  if (!sessionFile || !existsSync(sessionFile) || !statSync(sessionFile).isFile()) {
    return { messages: [], sessionId };
  }

  return {
    messages: readSessionMessagesFromFile(sessionFile, options.messageCount ?? 20),
    sessionId,
  };
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

function normalizeSlugSegment(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "session";
}

function toSourceTitle(sourceRef) {
  const value = basename(sourceRef).replace(/\.[^.]+$/, "").trim();
  return value.length > 0 ? value : "source";
}

function toSourceSlugBase(title) {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "source";
}

function buildSourceSlug(sourceRef) {
  const title = toSourceTitle(sourceRef);
  const slugSuffix = createHash("sha1").update(sourceRef).digest("hex").slice(0, 10);
  return `sources/${toSourceSlugBase(title)}-${slugSuffix}`;
}

export function extractMemoryItems(messages) {
  const seen = new Set();
  const items = [];

  for (const message of messages) {
    if (!message || message.role !== "user" || typeof message.content !== "string") {
      continue;
    }

    const trimmed = message.content.trim();

    if (trimmed.length === 0 || trimmed.startsWith("/")) {
      continue;
    }

    if (seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    items.push(trimmed);
  }

  return items;
}

function extractOpenThreads(items) {
  const pattern = /(明天|后天|今天|下周|下个月|周[一二三四五六日天]|星期[一二三四五六日天]|\d{4}-\d{2}-\d{2}|\d+月\d+日|\?|\？)/;
  return items.filter((item) => pattern.test(item));
}

function normalizeTimelineMarkdown(timeline) {
  return timeline.replace(/\r\n/g, "\n").trim();
}

function parseTimelineMarkdown(timeline) {
  const entries = [];
  let currentEntry = null;

  for (const line of normalizeTimelineMarkdown(timeline).split("\n")) {
    const trimmedLine = line.trimEnd();

    if (trimmedLine.trim().length === 0) {
      continue;
    }

    const match = trimmedLine.trim().match(TIMELINE_ENTRY_PATTERN);

    if (match) {
      currentEntry = {
        date: match[1],
        source: match[2].trim(),
        summary: match[3].trim(),
        detail: "",
      };
      entries.push(currentEntry);
      continue;
    }

    if (!currentEntry) {
      continue;
    }

    const continuation = trimmedLine.trim();
    currentEntry.detail = currentEntry.detail.length > 0
      ? `${currentEntry.detail}\n${continuation}`
      : continuation;
  }

  return entries;
}

export function renderExtractedMemoryPage(sessionId, sourceRef, messages, now = new Date()) {
  const items = extractMemoryItems(messages);
  const openThreads = extractOpenThreads(items);
  const title = `OpenClaw Session Memory ${sessionId}`;
  const summary = items[0] ?? "Session memory extracted from OpenClaw conversation.";
  const lines = [
    "---",
    `title: ${title}`,
    "type: concept",
    "tags:",
    "  - openclaw-memory",
    "  - session-memory",
    `session_id: ${sessionId}`,
    `source_ref: ${sourceRef}`,
    "---",
    "",
    `# ${title}`,
    "",
    `> ${summary}`,
    "",
    "## Extracted Memory",
  ];

  if (items.length === 0) {
    lines.push("- No durable user memory items were extracted.");
  } else {
    lines.push(...items.map((item) => `- ${item}`));
  }

  if (openThreads.length > 0) {
    lines.push("", "## Open Threads");
    lines.push(...openThreads.map((item) => `- [ ] ${item}`));
  }

  lines.push(
    "",
    "---",
    "",
    "## Timeline",
    `- **${toDateString(now)}** | ${sourceRef} — Session memory extracted from OpenClaw conversation.`,
    "",
  );

  return lines.join("\n");
}

function resolveBrainDbPath(options = {}) {
  if (typeof options.dbPath === "string" && options.dbPath.trim().length > 0) {
    return options.dbPath;
  }

  if (typeof process.env.GBRAIN_DB === "string" && process.env.GBRAIN_DB.trim().length > 0) {
    return process.env.GBRAIN_DB;
  }

  return join(homedir(), ".openclaw", "brain.db");
}

function openBrainDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(schemaSql);
  return db;
}

function getPageId(db, slug) {
  const row = db.prepare("SELECT id FROM pages WHERE slug = ?").get(slug);
  return row?.id ?? null;
}

function upsertPage(db, page) {
  db.prepare(
    `INSERT INTO pages (slug, type, title, compiled_truth, timeline, frontmatter)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       type = excluded.type,
       title = excluded.title,
       compiled_truth = excluded.compiled_truth,
       timeline = excluded.timeline,
       frontmatter = excluded.frontmatter,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(page.slug, page.type, page.title, page.compiledTruth, page.timeline, page.frontmatter);

  const pageId = getPageId(db, page.slug);

  if (pageId === null) {
    throw new Error(`Failed to resolve page id for ${page.slug}`);
  }

  return pageId;
}

function replaceTags(db, pageId, tags) {
  db.prepare("DELETE FROM tags WHERE page_id = ?").run(pageId);
  const insertTag = db.prepare(
    "INSERT INTO tags (page_id, tag) VALUES (?, ?) ON CONFLICT(page_id, tag) DO NOTHING",
  );

  for (const tag of tags) {
    insertTag.run(pageId, tag);
  }
}

function synchronizeTimelineEntries(db, pageId, timeline) {
  db.prepare("DELETE FROM timeline_entries WHERE page_id = ?").run(pageId);
  const entries = parseTimelineMarkdown(timeline);
  const insertTimeline = db.prepare(
    `INSERT INTO timeline_entries (page_id, date, source, summary, detail)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const entry of entries) {
    insertTimeline.run(pageId, entry.date, entry.source, entry.summary, entry.detail);
  }
}

function linkPages(db, fromSlug, toSlug, context) {
  const fromId = getPageId(db, fromSlug);
  const toId = getPageId(db, toSlug);

  if (fromId === null || toId === null) {
    throw new Error("Both pages must exist before linking");
  }

  db.prepare(
    `INSERT INTO links (from_page_id, to_page_id, context)
     VALUES (?, ?, ?)
     ON CONFLICT(from_page_id, to_page_id) DO UPDATE SET context = excluded.context`,
  ).run(fromId, toId, context);
}

function appendIngestLog(db, sourceType, sourceRef, pagesUpdated, summary) {
  db.prepare(
    `INSERT INTO ingest_log (source_type, source_ref, pages_updated, summary)
     VALUES (?, ?, ?, ?)`,
  ).run(sourceType, sourceRef, JSON.stringify(pagesUpdated), summary);
}

export async function ingestSessionTranscript(event, options = {}) {
  const directMessages = Array.isArray(event?.session?.messages) ? event.session.messages : undefined;
  const commandPayload = directMessages ? undefined : resolveMessagesFromCommandEvent(event, options);
  const messages = directMessages ?? commandPayload?.messages ?? [];

  if (!shouldIngestSession(messages)) {
    return { ingested: false, reason: "insufficient_messages" };
  }

  const now = options.now ?? (typeof event?.timestamp === "string" ? new Date(event.timestamp) : new Date());
  const sessionId = event?.session?.id ?? commandPayload?.sessionId ?? `session-${now.getTime()}`;
  const transcript = renderTranscript(messages, now);
  const directory = options.tmpDir ?? tmpdir();
  const filePath = join(directory, `gbrain-session-${sessionId}.md`);
  const sourceRef = `openclaw-session/${sessionId}`;
  const sourceSlug = buildSourceSlug(sourceRef);
  const extractedSlug = `concepts/openclaw-session-memory-${normalizeSlugSegment(sessionId)}`;
  const extractedPage = renderExtractedMemoryPage(sessionId, sourceRef, messages, now);
  const dbPath = resolveBrainDbPath(options);
  const writeTextFile = options.writeTextFile ?? ((path, text) => writeFileSync(path, text, "utf8"));

  mkdirSync(directory, { recursive: true });
  writeTextFile(filePath, transcript);

  let db;

  try {
    db = openBrainDatabase(dbPath);
    const sourceFrontmatter = JSON.stringify({
      title: toSourceTitle(sourceRef),
      type: "source",
      source_ref: sourceRef,
      session_id: sessionId,
    });
    const sourcePageId = upsertPage(db, {
      slug: sourceSlug,
      type: "source",
      title: toSourceTitle(sourceRef),
      compiledTruth: transcript.trim(),
      timeline: "",
      frontmatter: sourceFrontmatter,
    });
    replaceTags(db, sourcePageId, ["openclaw-session", "conversation-source"]);
    synchronizeTimelineEntries(db, sourcePageId, "");

    const extractedFrontmatter = JSON.stringify({
      title: `OpenClaw Session Memory ${sessionId}`,
      type: "concept",
      tags: ["openclaw-memory", "session-memory"],
      session_id: sessionId,
      source_ref: sourceRef,
    });
    const extractedPageId = upsertPage(db, {
      slug: extractedSlug,
      type: "concept",
      title: `OpenClaw Session Memory ${sessionId}`,
      compiledTruth: renderExtractedMemoryPage(sessionId, sourceRef, messages, now)
        .split("\n---\n")[0]
        .split("\n\n## Timeline")[0]
        .replace(/^---[\s\S]*?---\n\n/, ""),
      timeline: `- **${toDateString(now)}** | ${sourceRef} — Session memory extracted from OpenClaw conversation.`,
      frontmatter: extractedFrontmatter,
    });
    replaceTags(db, extractedPageId, ["openclaw-memory", "session-memory"]);
    synchronizeTimelineEntries(
      db,
      extractedPageId,
      `- **${toDateString(now)}** | ${sourceRef} — Session memory extracted from OpenClaw conversation.`,
    );
    linkPages(db, extractedSlug, sourceSlug, "Extracted from OpenClaw session transcript");
    appendIngestLog(db, "conversation", sourceRef, [sourceSlug, extractedSlug], `Ingested ${sourceRef}`);
    return { ingested: true, filePath, sourceRef, dbPath, sourceSlug, extractedSlug, extracted: true };
  } catch {
    return {
      ingested: false,
      reason: "ingest_failed",
      filePath,
      sourceRef,
      dbPath,
      sourceSlug,
      extractedSlug,
      extracted: false,
    };
  } finally {
    db?.close();
  }
}

export default async function handler(event) {
  await ingestSessionTranscript(event);
}
