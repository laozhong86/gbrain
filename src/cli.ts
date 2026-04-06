import { createInterface } from "node:readline";
import { runCall } from "./commands/call";
import { runConfigGet, runConfigSet } from "./commands/config";
import { runEmbed } from "./commands/embed";
import { runExport } from "./commands/export";
import { runIngest } from "./commands/ingest";
import { runBacklinks, runLink, runUnlink } from "./commands/link";
import { runGet } from "./commands/get";
import { runInit } from "./commands/init";
import { runImport } from "./commands/import";
import { runList } from "./commands/list";
import { runPut, runPutFromSource } from "./commands/put";
import { runQuery } from "./commands/query";
import { runSearch } from "./commands/search";
import { runServe } from "./commands/serve";
import { runStats } from "./commands/stats";
import { runTag, runTags, runUntag } from "./commands/tags";
import { runTimelineAdd, runTimelineList } from "./commands/timeline";
import { runVersion } from "./commands/version";
import { createOpenAIEmbeddingProvider } from "./core/embeddings";
import { isChunkStrategy } from "./core/markdown";
import { BrainDatabase } from "./core/db";
import { getToolDefinitions } from "./mcp/server";

function consumeDbFlag(argv: string[]): { args: string[]; dbPath: string } {
  const args = [...argv];
  const dbIndex = args.indexOf("--db");

  if (dbIndex === -1) {
    return { args, dbPath: process.env.GBRAIN_DB ?? "brain.db" };
  }

  const dbPath = args[dbIndex + 1];

  if (!dbPath) {
    throw new Error("Missing value for --db");
  }

  args.splice(dbIndex, 2);
  return { args, dbPath };
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return value;
}

function consumeOption(argv: string[], flag: string): { args: string[]; value?: string } {
  const args = [...argv];
  const index = args.indexOf(flag);

  if (index === -1) {
    return { args };
  }

  const value = args[index + 1];

  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  args.splice(index, 2);
  return { args, value };
}

function getToolsJson(): string {
  return JSON.stringify({ tools: getToolDefinitions() });
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

async function readStdinText(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error("Missing page content: provide a file path or pipe markdown via stdin");
  }

  const chunks: Uint8Array[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function loadEmbeddingRuntimeConfig(dbPath: string): {
  chunkStrategy: string;
  dimensions: number;
  model: string;
} {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    const model = brain.getConfig("embedding_model") ?? "text-embedding-3-small";
    const dimensions = parsePositiveInteger(
      brain.getConfig("embedding_dimensions") ?? "1536",
      "embedding_dimensions",
    );
    const chunkStrategy = brain.getConfig("chunk_strategy") ?? "section";

    if (!isChunkStrategy(chunkStrategy)) {
      throw new Error(`Unsupported chunk strategy: ${chunkStrategy}`);
    }

    return { model, dimensions, chunkStrategy };
  } finally {
    brain.close();
  }
}

async function runPipe(dbPath: string): Promise<void> {
  const readline = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  let hadFailure = false;

  try {
    for await (const line of readline) {
      const trimmedLine = line.trim();

      if (trimmedLine.length === 0) {
        continue;
      }

      try {
        const request = JSON.parse(trimmedLine) as {
          input?: unknown;
          tool?: unknown;
        };

        if (typeof request.tool !== "string") {
          throw new Error("Pipe request must include a string tool");
        }

        if (
          request.input === undefined ||
          request.input === null ||
          Array.isArray(request.input) ||
          typeof request.input !== "object"
        ) {
          throw new Error("Pipe request input must be a JSON object");
        }

        const result = await runCall(dbPath, request.tool, JSON.stringify(request.input));
        process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
      } catch (error) {
        hadFailure = true;
        const message = error instanceof Error ? error.message : String(error);
        process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
      }
    }
  } finally {
    readline.close();
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

async function run(argv: string[]): Promise<string | undefined> {
  if (argv.includes("--tools-json")) {
    return getToolsJson();
  }

  const db = consumeDbFlag(argv);
  const tag = consumeOption(db.args, "--tag");
  const [command, ...rest] = tag.args;

  switch (command) {
    case "init":
      return runInit(rest[0] ?? db.dbPath);
    case "get":
      return runGet(db.dbPath, requireArg(rest[0], "slug"));
    case "put":
      return rest[1]
        ? runPut(db.dbPath, requireArg(rest[0], "slug"), rest[1])
        : runPutFromSource(db.dbPath, requireArg(rest[0], "slug"), await readStdinText());
    case "import":
      return runImport(
        db.dbPath,
        requireArg(rest[0], "sourceDir"),
        rest.includes("--with-embeddings"),
      );
    case "export": {
      const exportArgs = consumeOption(rest, "--dir");
      return runExport(db.dbPath, exportArgs.value ?? exportArgs.args[0] ?? "export");
    }
    case "list": {
      const typeArgs = consumeOption(rest, "--type");
      const limitArgs = consumeOption(typeArgs.args, "--limit");
      return runList(db.dbPath, {
        tag: tag.value,
        type: typeArgs.value,
        limit: limitArgs.value ? parsePositiveInteger(limitArgs.value, "--limit") : undefined,
      });
    }
    case "link":
      return runLink(
        db.dbPath,
        requireArg(rest[0], "from"),
        requireArg(rest[1], "to"),
        rest[2] ?? "",
      );
    case "unlink":
      return runUnlink(db.dbPath, requireArg(rest[0], "from"), requireArg(rest[1], "to"));
    case "backlinks":
      return runBacklinks(db.dbPath, requireArg(rest[0], "slug"));
    case "tags":
      return runTags(db.dbPath, requireArg(rest[0], "slug"));
    case "tag":
      return runTag(db.dbPath, requireArg(rest[0], "slug"), requireArg(rest[1], "tag"));
    case "untag":
      return runUntag(db.dbPath, requireArg(rest[0], "slug"), requireArg(rest[1], "tag"));
    case "stats":
      return runStats(db.dbPath);
    case "search":
      requireArg(rest[0], "query");
      return runSearch(db.dbPath, rest.join(" "));
    case "embed": {
      const runtimeConfig = loadEmbeddingRuntimeConfig(db.dbPath);
      return runEmbed(
        db.dbPath,
        rest[0] === "--all" ? undefined : rest[0],
        createOpenAIEmbeddingProvider(process.env.OPENAI_API_KEY ?? "", {
          model: runtimeConfig.model,
          dimensions: runtimeConfig.dimensions,
        }),
        runtimeConfig.chunkStrategy,
      );
    }
    case "query": {
      requireArg(rest[0], "question");
      const runtimeConfig = loadEmbeddingRuntimeConfig(db.dbPath);
      return runQuery(
        db.dbPath,
        rest.join(" "),
        createOpenAIEmbeddingProvider(process.env.OPENAI_API_KEY ?? "", {
          model: runtimeConfig.model,
          dimensions: runtimeConfig.dimensions,
        }),
      );
    }
    case "serve":
      await runServe(db.dbPath);
      return undefined;
    case "call":
      return runCall(
        db.dbPath,
        requireArg(rest[0], "tool"),
        requireArg(rest[1], "payload"),
      );
    case "version":
      return runVersion();
    case "config":
      if (rest[0] === "set") {
        return runConfigSet(
          db.dbPath,
          requireArg(rest[1], "key"),
          requireArg(rest[2], "value"),
        );
      }

      return runConfigGet(db.dbPath, requireArg(rest[0], "key"));
    case "pipe":
      await runPipe(db.dbPath);
      return undefined;
    case "timeline":
      return runTimelineList(db.dbPath, requireArg(rest[0], "slug"));
    case "timeline-add": {
      const dateArgs = consumeOption(rest.slice(1), "--date");
      const summaryArgs = consumeOption(dateArgs.args, "--summary");
      const sourceArgs = consumeOption(summaryArgs.args, "--source");
      const detailArgs = consumeOption(sourceArgs.args, "--detail");
      return runTimelineAdd(
        db.dbPath,
        requireArg(rest[0], "slug"),
        {
          date: requireArg(dateArgs.value, "date"),
          summary: requireArg(summaryArgs.value, "summary"),
          source: sourceArgs.value,
          detail: detailArgs.value,
        },
      );
    }
    case "ingest": {
      const ingestArgs = consumeOption(rest.slice(1), "--type");
      return runIngest(db.dbPath, requireArg(rest[0], "file"), ingestArgs.value ?? "doc");
    }
    default:
      throw new Error(`Unknown command: ${command ?? ""}`.trim());
  }
}

async function main(): Promise<void> {
  try {
    const output = await run(Bun.argv.slice(2));

    if (output !== undefined) {
      console.log(output);
    }
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
  }
}

await main();
