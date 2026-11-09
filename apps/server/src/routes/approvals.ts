import type { FastifyInstance } from "fastify";
import { ApprovalDecision } from "@salesdeck/shared";
import { decideApproval } from "../domain/approvals.js";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";

export function registerApprovals(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  app.after(() => {
    app.post(
      "/api/approvals/:id/decide",
      {
        attachValidation: true,
        schema: {
          tags: ["trade"],
          summary: "Approve or reject a pending approval",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
          body: {
            type: "object",
            required: ["decision", "idempotencyKey"],
            properties: {
              decision: { type: "string", enum: ["approve", "reject"] },
              comment: { type: "string" },
              idempotencyKey: { type: "string" },
            },
          },
          response: {
            200: { type: "object", additionalProperties: true },
            400: { type: "object", additionalProperties: true },
            403: { type: "object", additionalProperties: true },
          },
        },
      },
      async (request, reply) => {
        const parsed = ApprovalDecision.safeParse(request.body);
        if (!parsed.success) return reply.code(400).send({ ok: false, error: { code: "VALIDATION_ERROR", message: "请求参数不合法", details: parsed.error.issues } });
        const body = parsed.data;
        const actorId = (request.headers["x-actor-id"] as string | undefined) ?? "u_manager_wang";
        const actor = deps.db.select().from(users).where(eq(users.id, actorId)).get();
        if (!actor) return reply.code(403).send({ ok: false, error: { code: "FORBIDDEN", message: "未知用户" } });
        const { id } = request.params as { id: string };
        try {
          const result = decideApproval({ db: deps.db, sqlite: deps.sqlite, actor, traceId: "approval", emit: () => {} }, id, body.decision, body.comment, body.idempotencyKey);
          return { ok: true, data: result };
        } catch (error) {
          return reply.code(400).send({ ok: false, error: { code: "APPROVAL_FAILED", message: error instanceof Error ? error.message : "审批失败" } });
        }
      },
    );
  });
}
