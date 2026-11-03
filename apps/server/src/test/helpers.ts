import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "../db/client.js";

export function makeTestDb() {
  const { db, sqlite } = createDb(":memory:");
  migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });
  return { db, sqlite };
}
