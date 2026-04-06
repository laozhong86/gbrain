import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

const schemaSql = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

export class BrainDatabase {
  readonly db: Database;

  constructor(readonly dbPath: string) {
    this.db = new Database(dbPath, { create: true });
  }

  initialize(): void {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(schemaSql);
  }

  close(): void {
    this.db.close();
  }
}
