import dotenv from "dotenv";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "./db/client.js";
import { seedDatabase } from "./db/seed.js";
import { users } from "./db/schema.js";
import { ingestKnowledge } from "./rag/ingest.js";
import { getProvider } from "./agent/deepseekProvider.js";
import { buildApp } from "./app.js";

// `pnpm dev` runs the server from apps/server; load the repo-root .env explicitly.
dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env") });
dotenv.config({ path: path.resolve(import.meta.dirname, "../../.env"), override: true });

const { db, sqlite } = createDb();
migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
if (db.select().from(users).all().length === 0) seedDatabase(db);
ingestKnowledge(db, path.resolve(import.meta.dirname, "../../../knowledge"));
const provider = getProvider();
console.log(`[SalesPilot] LLM provider: ${provider.name}`);
const app = buildApp({ db, sqlite, provider });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
