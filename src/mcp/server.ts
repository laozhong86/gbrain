import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runGet } from "../commands/get";
import { runBacklinks } from "../commands/link";
import { runList } from "../commands/list";
import { runPutFromSource } from "../commands/put";
import { runQuery } from "../commands/query";
import { runSearch } from "../commands/search";
import { runStats } from "../commands/stats";
import { runTag, runTags, runUntag } from "../commands/tags";
import { runTimelineAdd, runTimelineList } from "../commands/timeline";
import { BrainDatabase } from "../core/db";
import { createOpenAIEmbeddingProvider } from "../core/embeddings";

const toolDefinitions = [
  { name: "brain_get", description: "Read a page by slug" },
  { name: "brain_put", description: "Write or update a page from markdown" },
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
  content: z.string(),
});

const searchInputSchema = z.object({
  query: z.string(),
});

const queryInputSchema = z.object({
  question: z.string(),
});

const timelineInputSchema = z.object({
  slug: z.string(),
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
});

const backlinksInputSchema = z.object({
  slug: z.string(),
});

const rawInputSchema = z.object({
  slug: z.string(),
  source: z.string().optional(),
  data: z.string().optional(),
});

function createProvider() {
  return createOpenAIEmbeddingProvider(process.env.OPENAI_API_KEY ?? "");
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
      const existingRecords = brain
        .listRawData()
        .filter((record) => record.slug === input.slug)
        .map(({ source, data }) => ({ source, data }));
      const mergedRecords = new Map(existingRecords.map((record) => [record.source, record.data]));

      mergedRecords.set(input.source, input.data);
      brain.replaceRawData(
        input.slug,
        [...mergedRecords.entries()].map(([source, data]) => ({ source, data })),
      );
      return `Stored raw data for ${input.slug}/${input.source}`;
    }

    const records = brain
      .listRawData()
      .filter((record) => record.slug === input.slug && (input.source === undefined || record.source === input.source))
      .map(({ source, data }) => ({ source, data }));

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
      return runPutFromSource(dbPath, input.slug, input.content);
    }
    case "brain_search": {
      const input = searchInputSchema.parse(args);
      return runSearch(dbPath, input.query);
    }
    case "brain_query": {
      const input = queryInputSchema.parse(args);
      return runQuery(dbPath, input.question, createProvider());
    }
    case "brain_timeline": {
      const input = timelineInputSchema.parse(args);
      return runTimelineList(dbPath, input.slug);
    }
    case "brain_timeline_add": {
      const input = timelineAddInputSchema.parse(args);
      return runTimelineAdd(dbPath, input.slug, input.date, input.source, input.summary, input.detail);
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
      return runList(dbPath, input.tag);
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
