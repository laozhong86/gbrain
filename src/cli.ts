import { runGet } from "./commands/get";
import { runInit } from "./commands/init";
import { runList } from "./commands/list";
import { runPut } from "./commands/put";
import { runStats } from "./commands/stats";

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

function run(argv: string[]): string {
  const { args, dbPath } = consumeDbFlag(argv);
  const [command, ...rest] = args;

  switch (command) {
    case "init":
      return runInit(dbPath);
    case "get":
      return runGet(dbPath, requireArg(rest[0], "slug"));
    case "put":
      return runPut(dbPath, requireArg(rest[0], "slug"), requireArg(rest[1], "file"));
    case "list":
      return runList(dbPath);
    case "stats":
      return runStats(dbPath);
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
