import "dotenv/config";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "./db/client.js";
import { seedDatabase } from "./db/seed.js";
import { users } from "./db/schema.js";
import { ingestKnowledge } from "./rag/ingest.js";
import { getProvider } from "./agent/deepseekProvider.js";
import { buildApp } from "./app.js";

const { db, sqlite } = createDb();
migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
if (db.select().from(users).all().length === 0) seedDatabase(db);
ingestKnowledge(db, path.resolve(import.meta.dirname, "../../../knowledge"));
const app = buildApp({ db, sqlite, provider: getProvider() });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
