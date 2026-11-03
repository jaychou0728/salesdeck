import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export function createDb(url = process.env.DATABASE_URL ?? "./data/app.db") {
  if (url !== ":memory:") {
    const dir = url.substring(0, url.lastIndexOf("/"));
    if (dir) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export type Db = ReturnType<typeof createDb>["db"];
