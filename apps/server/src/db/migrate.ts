import "dotenv/config";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "./client.js";

const { db, sqlite } = createDb();
try {
  migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });
  console.log("migrations applied");
} finally {
  sqlite.close();
}
