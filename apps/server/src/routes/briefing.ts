import type { FastifyInstance } from "fastify";
import { executeTool, toolMap } from "../tools/index.js";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";

export function registerBriefing(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  app.after(() => {
    app.get(
      "/api/briefing",
      {
        attachValidation: true,
        schema: {
          tags: ["sales"],
          summary: "Get credit, inventory and expiring-quote alerts",
          querystring: { type: "object", properties: { scope: { type: "string", enum: ["self", "team"] } } },
          response: {
            200: { type: "object", additionalProperties: true },
            403: { type: "object", additionalProperties: true },
          },
        },
      },
      async (request, reply) => {
        const actorId = (request.headers["x-actor-id"] as string | undefined) ?? "u_sales_lin";
        const actor = deps.db.select().from(users).where(eq(users.id, actorId)).get();
        if (!actor) return reply.code(403).send({ ok: false, error: { code: "FORBIDDEN", message: "未知用户" } });
        const scope = ((request.query as { scope?: string }).scope ?? (actor.role === "manager" ? "team" : "self")) as "self" | "team";
        const outcome = await executeTool(toolMap.get("get_sales_briefing")!, { db: deps.db, sqlite: deps.sqlite, actor, traceId: "briefing", emit: () => {} }, { scope });
        return outcome.model.ok ? outcome.model.data : { alerts: [] };
      },
    );
  });
}
