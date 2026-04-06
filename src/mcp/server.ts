import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runGet } from "../commands/get";
import { runIngestContent } from "../commands/ingest";
import { runBacklinks, runLink } from "../commands/link";
import { runList } from "../commands/list";
import { runPutFromSource } from "../commands/put";
import { runQuery } from "../commands/query";
import { runSearch } from "../commands/search";
import { runStats } from "../commands/stats";
import { runTag, runTags, runUntag } from "../commands/tags";
import { runTimelineAdd, runTimelineList } from "../commands/timeline";
import { BrainDatabase } from "../core/db";
import { createOpenAIEmbeddingProvider } from "../core/embeddings";
import { renderMarkdownDocument, parseStoredFrontmatter } from "../core/markdown";
import { PAGE_TYPES } from "../core/types";

const toolDefinitions = [
  { name: "brain_get", description: "Read a page by slug" },
  { name: "brain_put", description: "Write or update a page from markdown" },
  { name: "brain_ingest", description: "Ingest a source document" },
  { name: "brain_link", description: "Create a cross-reference between pages" },
  { name: "brain_search", description: "Run lexical search over indexed pages" },
  { name: "brain_query", description: "Run hybrid semantic search" },
  { name: "brain_timeline", description: "Read timeline entries for a page" },
  { name: "brain_timeline_add", description: "Append a timeline entry to a page" },
  { name: "brain_tags", description: "List tags for a page" },
  { name: "brain_tag", description: "Add or remove a tag from a page" },
  { name: "brain_list", description: "List pages in the brain" },
  { name: "brain_backlinks", description: "List pages linking to a slug" },
  { name: "brain_stats", description: "Return basic brain statistics" },
  { name: "brain_raw", description: "Read or update raw enrichment data" },
] as const;

const getInputSchema = z.object({
  slug: z.string(),
});

const putInputSchema = z.object({
  slug: z.string(),
  content: z.string().optional(),
  compiled_truth: z.string().optional(),
  timeline_append: z.string().optional(),
  frontmatter: z.record(z.unknown()).optional(),
}).refine(
  (input) =>
    input.content !== undefined ||
    input.compiled_truth !== undefined ||
    input.timeline_append !== undefined ||
    input.frontmatter !== undefined,
  { message: "brain_put requires content or structured page fields" },
);

const ingestInputSchema = z.object({
  content: z.string(),
  source_ref: z.string(),
  source_type: z.string(),
});

const linkInputSchema = z.object({
  from: z.string(),
  to: z.string(),
  context: z.string().optional(),
});

const searchInputSchema = z.object({
  query: z.string(),
  type: z.enum(PAGE_TYPES).optional(),
  limit: z.number().int().positive().optional(),
});

const queryInputSchema = z.object({
  question: z.string(),
  limit: z.number().int().positive().optional(),
});

const timelineInputSchema = z.object({
  slug: z.string(),
  limit: z.number().int().positive().optional(),
});

const timelineAddInputSchema = z.object({
  slug: z.string(),
  date: z.string(),
  source: z.string().default("manual"),
  summary: z.string(),
  detail: z.string().default(""),
});

const tagsInputSchema = z.object({
  slug: z.string(),
});

const tagInputSchema = z.object({
  slug: z.string(),
  tag: z.string(),
  remove: z.boolean().default(false),
});

const listInputSchema = z.object({
  tag: z.string().optional(),
  type: z.enum(PAGE_TYPES).optional(),
  limit: z.number().int().positive().optional(),
});

const backlinksInputSchema = z.object({
  slug: z.string(),
});

const rawInputSchema = z.object({
  slug: z.string(),
  source: z.string().optional(),
  data: z.union([z.record(z.unknown()), z.string()]).optional(),
});

function createProvider(dbPath: string) {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const model = brain.getConfig("embedding_model") ?? "text-embedding-3-small";
    const dimensions = Number.parseInt(brain.getConfig("embedding_dimensions") ?? "1536", 10);

    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error("embedding_dimensions must be a positive integer");
    }

    return createOpenAIEmbeddingProvider(process.env.OPENAI_API_KEY ?? "", {
      model,
      dimensions,
    });
  } finally {
    brain.close();
  }
}

function buildStructuredPutSource(
  dbPath: string,
  input: z.infer<typeof putInputSchema>,
): string {
  if (input.content !== undefined) {
    return input.content;
  }

  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const page = brain.getPageBySlug(input.slug);
    const frontmatter = {
      ...(page ? parseStoredFrontmatter(input.slug, page.frontmatter) : {}),
      ...(input.frontmatter ?? {}),
    };
    const compiledTruth = input.compiled_truth ?? page?.compiledTruth ?? "";
    const timeline = [page?.timeline.trim() ?? "", input.timeline_append?.trim() ?? ""]
      .filter((value) => value.length > 0)
      .join("\n");

    return renderMarkdownDocument({
      frontmatter,
      compiledTruth,
      timeline,
    });
  } finally {
    brain.close();
  }
}

function formatRawRecords(records: Array<{ source: string; data: string }>): string {
  return records.map((record) => `${record.source}: ${record.data}`).join("\n");
}

async function callRawTool(
  dbPath: string,
  input: z.infer<typeof rawInputSchema>,
): Promise<string> {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();

    if (input.source !== undefined && input.data !== undefined) {
      brain.upsertRawDataSource(
        input.slug,
        input.source,
        typeof input.data === "string" ? input.data : JSON.stringify(input.data),
      );
      return `Stored raw data for ${input.slug}/${input.source}`;
    }

    const records = brain.listRawDataForPage(input.slug, input.source);

    return formatRawRecords(records);
  } finally {
    brain.close();
  }
}

export function getToolDefinitions(): Array<{ name: string; description: string }> {
  return [...toolDefinitions];
}

export async function callTool(
  dbPath: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case "brain_get": {
      const input = getInputSchema.parse(args);
      return runGet(dbPath, input.slug);
    }
    case "brain_put": {
      const input = putInputSchema.parse(args);
      return runPutFromSource(dbPath, input.slug, buildStructuredPutSource(dbPath, input));
    }
    case "brain_ingest": {
      const input = ingestInputSchema.parse(args);
      return runIngestContent(dbPath, {
        content: input.content,
        sourceRef: input.source_ref,
        sourceType: input.source_type,
      });
    }
    case "brain_link": {
      const input = linkInputSchema.parse(args);
      return runLink(dbPath, input.from, input.to, input.context ?? "");
    }
    case "brain_search": {
      const input = searchInputSchema.parse(args);
      return runSearch(dbPath, input.query, { type: input.type, limit: input.limit });
    }
    case "brain_query": {
      const input = queryInputSchema.parse(args);
      return runQuery(dbPath, input.question, createProvider(dbPath), input.limit);
    }
    case "brain_timeline": {
      const input = timelineInputSchema.parse(args);
      return runTimelineList(dbPath, input.slug, input.limit);
    }
    case "brain_timeline_add": {
      const input = timelineAddInputSchema.parse(args);
      return runTimelineAdd(dbPath, input.slug, {
        date: input.date,
        source: input.source,
        summary: input.summary,
        detail: input.detail,
      });
    }
    case "brain_tags": {
      const input = tagsInputSchema.parse(args);
      return runTags(dbPath, input.slug);
    }
    case "brain_tag": {
      const input = tagInputSchema.parse(args);
      return input.remove ? runUntag(dbPath, input.slug, input.tag) : runTag(dbPath, input.slug, input.tag);
    }
    case "brain_list": {
      const input = listInputSchema.parse(args);
      return runList(dbPath, { tag: input.tag, type: input.type, limit: input.limit });
    }
    case "brain_backlinks": {
      const input = backlinksInputSchema.parse(args);
      return runBacklinks(dbPath, input.slug);
    }
    case "brain_stats":
      return runStats(dbPath);
    case "brain_raw": {
      const input = rawInputSchema.parse(args);
      return callRawTool(dbPath, input);
    }
    default:
      throw new Error(`Unsupported tool: ${toolName}`);
  }
}

export async function buildServer(dbPath: string): Promise<McpServer> {
  const server = new McpServer({ name: "gbrain", version: "0.1.0" });

  server.registerTool("brain_get", {
    description: "Read a page by slug",
    inputSchema: getInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_get", args) }],
  }));

  server.registerTool("brain_put", {
    description: "Write or update a page from markdown",
    inputSchema: putInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_put", args) }],
  }));

  server.registerTool("brain_ingest", {
    description: "Ingest a source document",
    inputSchema: ingestInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_ingest", args) }],
  }));

  server.registerTool("brain_link", {
    description: "Create a cross-reference between pages",
    inputSchema: linkInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_link", args) }],
  }));

  server.registerTool("brain_search", {
    description: "Run lexical search over indexed pages",
    inputSchema: searchInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_search", args) }],
  }));

  server.registerTool("brain_query", {
    description: "Run hybrid semantic search",
    inputSchema: queryInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_query", args) }],
  }));

  server.registerTool("brain_timeline", {
    description: "Read timeline entries for a page",
    inputSchema: timelineInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_timeline", args) }],
  }));

  server.registerTool("brain_timeline_add", {
    description: "Append a timeline entry to a page",
    inputSchema: timelineAddInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_timeline_add", args) }],
  }));

  server.registerTool("brain_tags", {
    description: "List tags for a page",
    inputSchema: tagsInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_tags", args) }],
  }));

  server.registerTool("brain_tag", {
    description: "Add or remove a tag from a page",
    inputSchema: tagInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_tag", args) }],
  }));

  server.registerTool("brain_list", {
    description: "List pages in the brain",
    inputSchema: listInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_list", args) }],
  }));

  server.registerTool("brain_backlinks", {
    description: "List pages linking to a slug",
    inputSchema: backlinksInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_backlinks", args) }],
  }));

  server.registerTool("brain_stats", {
    description: "Return basic brain statistics",
  }, async () => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_stats", {}) }],
  }));

  server.registerTool("brain_raw", {
    description: "Read or update raw enrichment data",
    inputSchema: rawInputSchema,
  }, async (args) => ({
    content: [{ type: "text", text: await callTool(dbPath, "brain_raw", args) }],
  }));

  server.registerResource("brain-index", "brain://index", {
    title: "Brain Index",
    description: "List of pages in the brain",
    mimeType: "text/plain",
  }, async () => ({
    contents: [{ uri: "brain://index", text: runList(dbPath), mimeType: "text/plain" }],
  }));

  server.registerResource(
    "brain-page",
    new ResourceTemplate("brain://pages/{slug}", { list: undefined }),
    {
      title: "Brain Page",
      description: "Read a page by slug",
      mimeType: "text/markdown",
    },
    async (uri, variables) => ({
      contents: [{ uri: uri.href, text: runGet(dbPath, String(variables.slug)), mimeType: "text/markdown" }],
    }),
  );

  server.registerPrompt("brain_briefing", {
    description: "Create a briefing from the current brain state",
  }, async () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Compile a briefing from the latest brain state, active deals, and open threads.",
        },
      },
    ],
  }));

  server.registerPrompt("brain_ingest_meeting", {
    description: "Guide transcript ingestion using GBrain rules",
  }, async () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Ingest this meeting transcript into GBrain using compiled truth and append-only timeline rules.",
        },
      },
    ],
  }));

  return server;
}
