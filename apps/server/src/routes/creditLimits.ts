import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError, CreditLimitRequestInput } from "@salesdeck/shared";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { customers } from "../db/schema.js";
import { resolveActor, scopedOwnerIds } from "../lib/actor.js";
import { createApproval } from "../domain/approvals.js";

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
};

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.code(ERROR_STATUS[error.code] ?? 400).send({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
  }
  return reply.code(500).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "服务器内部错误" } });
}

export function registerCreditLimits(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  app.after(() => {
    app.post(
      "/api/business/customers/:id/credit-limit-requests",
      {
        attachValidation: true,
        schema: {
          tags: ["workspace"],
          summary: "Request a credit limit increase for a scoped customer",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const actor = resolveActor(deps.db, request);
          const { id } = request.params as { id: string };
          const customer = deps.db.select().from(customers).where(eq(customers.id, id)).get();
          if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
          if (!scopedOwnerIds(deps.db, actor).includes(customer.ownerId)) {
            throw new AppError("FORBIDDEN", "无权为该客户申请提额");
          }
          const parsed = CreditLimitRequestInput.safeParse(request.body);
          if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请求参数不合法", parsed.error.issues);
          if (parsed.data.requestedLimitCents <= customer.creditLimitCents) {
            throw new AppError("VALIDATION_ERROR", "申请额度必须高于当前额度");
          }
          const approvalId = createApproval(
            { db: deps.db, sqlite: deps.sqlite, actor, traceId: `credit_limit_${randomUUID()}`, emit: () => {} },
            {
              type: "credit_limit",
              targetType: "customer",
              targetId: customer.id,
              requesterId: actor.id,
              reason: parsed.data.reason,
              payload: {
                customerId: customer.id,
                currentLimitCents: customer.creditLimitCents,
                requestedLimitCents: parsed.data.requestedLimitCents,
              },
            },
          );
          return { ok: true, approvalId };
        } catch (error) {
          return sendError(reply, error);
        }
      },
    );
  });
}
