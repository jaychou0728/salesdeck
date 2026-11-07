import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { seedDatabase } from "../db/seed.js";

export function registerDemo(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  app.after(() => {
    app.post(
      "/api/demo/reset",
      {
        schema: {
          tags: ["demo"],
          summary: "Reset demo data (requires DEMO_MODE=true)",
          response: {
            200: { type: "object", additionalProperties: true },
            403: { type: "object", additionalProperties: true },
          },
        },
      },
      async (_request, reply) => {
        if (process.env.DEMO_MODE !== "true") return reply.code(403).send({ ok: false, error: { code: "FORBIDDEN", message: "demo mode disabled" } });
        const tables = [
          "follow_ups",
          "opportunities",
          "messages",
          "conversations",
          "trace_events",
          "traces",
          "audit_logs",
          "idempotency_keys",
          "confirmation_tokens",
          "after_sales_tickets",
          "approvals",
          "stock_reservations",
          "order_lines",
          "orders",
          "quote_lines",
          "quotes",
          "inventory",
          "warehouses",
          "price_rules",
          "products",
          "contacts",
          "customers",
          "users",
        ];
        deps.sqlite.transaction(() => {
          for (const table of tables) deps.sqlite.prepare(`delete from ${table}`).run();
          seedDatabase(deps.db);
        })();
        return { ok: true };
      },
    );
  });
}
