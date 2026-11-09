import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { AppError } from "@salesdeck/shared";
import type Database from "better-sqlite3";
import type { Db } from "../db/client.js";
import { afterSalesTickets, auditLogs, customers } from "../db/schema.js";
import { resolveActor, scopedOwnerIds } from "../lib/actor.js";

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_STATE: 400,
};

const TICKET_PATCH = z
  .object({
    status: z.enum(["open", "processing", "resolved", "closed"]).optional(),
    resolution: z.string().min(2).max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "没有需要更新的字段" });

const TICKET_TRANSITIONS: Record<string, string[]> = {
  open: ["processing", "resolved", "closed"],
  processing: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.code(ERROR_STATUS[error.code] ?? 400).send({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details, suggestedAction: error.suggestedAction },
    });
  }
  return reply.code(500).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "服务器内部错误" } });
}

function handle(fn: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> | unknown) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(request, reply);
    } catch (error) {
      return sendError(reply, error);
    }
  };
}

function writeAudit(db: Db, actorId: string, toolName: string, args: unknown, result: unknown) {
  db.insert(auditLogs)
    .values({
      id: `audit_${randomUUID()}`,
      traceId: `manual_${toolName}_${randomUUID()}`,
      actorId,
      toolName,
      argsJson: JSON.stringify(args),
      resultJson: JSON.stringify(result),
      status: "ok",
      latencyMs: 0,
      createdAt: Date.now(),
    })
    .run();
}

export function registerTickets(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  app.after(() => {
    app.patch(
      "/api/business/tickets/:id",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Update an after-sales ticket status and resolution",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = resolveActor(deps.db, request);
        const { id } = request.params as { id: string };
        const ticket = deps.db.select().from(afterSalesTickets).where(eq(afterSalesTickets.id, id)).get();
        if (!ticket) throw new AppError("NOT_FOUND", "工单不存在");
        const customer = deps.db.select().from(customers).where(eq(customers.id, ticket.customerId)).get();
        if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
        if (!scopedOwnerIds(deps.db, actor).includes(customer.ownerId)) {
          throw new AppError("FORBIDDEN", "无权操作该工单");
        }

        const parsed = TICKET_PATCH.safeParse(request.body ?? {});
        if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请求参数不合法", parsed.error.issues);
        const input = parsed.data;

        if (input.status && input.status !== ticket.status) {
          if (!TICKET_TRANSITIONS[ticket.status]?.includes(input.status)) {
            throw new AppError("INVALID_STATE", `工单不能从 ${ticket.status} 变为 ${input.status}`);
          }
        }
        const nextResolution = input.resolution ?? ticket.resolution;
        if (input.status === "resolved" && (!nextResolution || nextResolution.trim().length < 2)) {
          throw new AppError("VALIDATION_ERROR", "标记已解决前请填写处理结果");
        }

        deps.db.update(afterSalesTickets)
          .set({
            status: input.status ?? ticket.status,
            resolution: input.resolution ?? ticket.resolution,
          })
          .where(eq(afterSalesTickets.id, ticket.id))
          .run();
        const updated = deps.db.select().from(afterSalesTickets).where(eq(afterSalesTickets.id, ticket.id)).get()!;
        writeAudit(
          deps.db,
          actor.id,
          "update_ticket",
          { ticketId: ticket.id, previousStatus: ticket.status, patch: input },
          updated,
        );
        return { ok: true, ticket: updated };
      }),
    );
  });
}
