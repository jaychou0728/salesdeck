import type { FastifyInstance } from "fastify";
import { ConfirmRequest } from "@salespilot/shared";
import { executeTool, toolMap } from "../tools/index.js";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";

export function registerConfirmations(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  app.after(() => {
    app.post(
      "/api/confirmations/confirm",
      {
        attachValidation: true,
        schema: {
          tags: ["trade"],
          summary: "Confirm a write preview with a one-time token",
          body: {
            type: "object",
            required: ["token", "toolName", "payload", "idempotencyKey"],
            properties: {
              token: { type: "string" },
              toolName: { type: "string" },
              payload: { type: "object" },
              idempotencyKey: { type: "string" },
            },
          },
          response: {
            200: { type: "object", additionalProperties: true },
            400: { type: "object", additionalProperties: true },
            403: { type: "object", additionalProperties: true },
            404: { type: "object", additionalProperties: true },
          },
        },
      },
      async (request, reply) => {
        const parsed = ConfirmRequest.safeParse(request.body);
        if (!parsed.success) return reply.code(400).send({ ok: false, error: { code: "VALIDATION_ERROR", message: "请求参数不合法", details: parsed.error.issues } });
        const body = parsed.data;
        const actorId = (request.headers["x-actor-id"] as string | undefined) ?? "u_sales_lin";
        const actor = deps.db.select().from(users).where(eq(users.id, actorId)).get();
        if (!actor) return reply.code(403).send({ ok: false, error: { code: "FORBIDDEN", message: "未知用户" } });
        const definition = toolMap.get(body.toolName);
        if (!definition) return reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: "工具不存在" } });
        const ctx = { db: deps.db, sqlite: deps.sqlite, actor, traceId: "confirm", emit: () => {} };
        const outcome = await executeTool(definition, ctx, {
          ...body.payload,
          dryRun: false,
          confirmationToken: body.token,
          idempotencyKey: body.idempotencyKey,
        });
        return reply.code(outcome.model.ok ? 200 : 400).send(outcome.model);
      },
    );
  });
}
