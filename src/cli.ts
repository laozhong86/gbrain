import { runBacklinks, runLink, runUnlink } from "./commands/link";
import { runGet } from "./commands/get";
import { runInit } from "./commands/init";
import { runList } from "./commands/list";
import { runPut } from "./commands/put";
import { runStats } from "./commands/stats";
import { runTag, runTags, runUntag } from "./commands/tags";

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

function run(argv: string[]): string {
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
    default:
      throw new Error(`Unknown command: ${command ?? ""}`.trim());
  }
}

try {
  console.log(run(Bun.argv.slice(2)));
} catch (error) {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
}
