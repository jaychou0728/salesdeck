import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "./client.js";

const { db, sqlite } = createDb();
migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });
sqlite.close();
console.log("migrations applied");
