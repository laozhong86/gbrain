import { runEmbed } from "./commands/embed";
import { runExport } from "./commands/export";
import { runIngest } from "./commands/ingest";
import { runBacklinks, runLink, runUnlink } from "./commands/link";
import { runGet } from "./commands/get";
import { runInit } from "./commands/init";
import { runImport } from "./commands/import";
import { runList } from "./commands/list";
import { runPut } from "./commands/put";
import { runQuery } from "./commands/query";
import { runSearch } from "./commands/search";
import { runStats } from "./commands/stats";
import { runTag, runTags, runUntag } from "./commands/tags";
import { runTimelineAdd, runTimelineList } from "./commands/timeline";
import { createOpenAIEmbeddingProvider } from "./core/embeddings";

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

async function run(argv: string[]): Promise<string> {
  const db = consumeDbFlag(argv);
  const tag = consumeOption(db.args, "--tag");
  const [command, ...rest] = tag.args;

  switch (command) {
    case "init":
      return runInit(db.dbPath);
    case "get":
      return runGet(db.dbPath, requireArg(rest[0], "slug"));
    case "put":
      return runPut(db.dbPath, requireArg(rest[0], "slug"), requireArg(rest[1], "file"));
    case "import":
      return runImport(
        db.dbPath,
        requireArg(rest[0], "sourceDir"),
        rest.includes("--with-embeddings"),
      );
    case "export":
      return runExport(db.dbPath, rest[0] ?? "export");
    case "list":
      return runList(db.dbPath, tag.value);
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
    case "embed":
      return runEmbed(
        db.dbPath,
        rest[0] === "--all" ? undefined : rest[0],
        createOpenAIEmbeddingProvider(process.env.OPENAI_API_KEY ?? ""),
      );
    case "query":
      requireArg(rest[0], "question");
      return runQuery(
        db.dbPath,
        rest.join(" "),
        createOpenAIEmbeddingProvider(process.env.OPENAI_API_KEY ?? ""),
      );
    case "timeline":
      return runTimelineList(db.dbPath, requireArg(rest[0], "slug"));
    case "timeline-add":
      return runTimelineAdd(
        db.dbPath,
        requireArg(rest[0], "slug"),
        requireArg(rest[1], "date"),
        requireArg(rest[2], "source"),
        requireArg(rest[3], "summary"),
        rest[4] ?? "",
      );
    case "ingest":
      return runIngest(db.dbPath, requireArg(rest[0], "file"), rest[1] ?? "doc");
    default:
      throw new Error(`Unknown command: ${command ?? ""}`.trim());
  }
}

async function main(): Promise<void> {
  try {
    console.log(await run(Bun.argv.slice(2)));
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
  }
}

await main();
