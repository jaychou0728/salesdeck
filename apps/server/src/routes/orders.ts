import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { AppError } from "@salesdeck/shared";
import type Database from "better-sqlite3";
import type { Db } from "../db/client.js";
import {
  auditLogs,
  customers,
  inventory,
  opportunities,
  orderLines,
  orders,
  quoteLines,
  quotes,
  stockReservations,
} from "../db/schema.js";
import { resolveActor, scopedOwnerIds } from "../lib/actor.js";
import { assertManager } from "../domain/permissions.js";

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_STATE: 400,
  CONFLICT: 409,
};

const ORDER_UPDATE = z.object({
  status: z.enum(["fulfilled", "cancelled"]),
  reason: z.string().max(200).optional(),
});

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

export function registerOrders(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  app.after(() => {
    app.patch(
      "/api/business/orders/:id",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Fulfil or cancel a reserved order (cancel is manager-only)",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = resolveActor(deps.db, request);
        const { id } = request.params as { id: string };
        const order = deps.db.select().from(orders).where(eq(orders.id, id)).get();
        if (!order) throw new AppError("NOT_FOUND", "订单不存在");
        if (!scopedOwnerIds(deps.db, actor).includes(order.ownerId)) {
          throw new AppError("FORBIDDEN", "无权操作该订单");
        }
        const parsed = ORDER_UPDATE.safeParse(request.body ?? {});
        if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请求参数不合法", parsed.error.issues);
        const input = parsed.data;
        if (order.status !== "reserved") {
          throw new AppError("INVALID_STATE", `订单当前状态为 ${order.status}，只有已预留订单可以操作`);
        }
        if (input.status === "cancelled") assertManager(actor);

        deps.sqlite.transaction(() => {
          const reservations = deps.db
            .select()
            .from(stockReservations)
            .where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, "active")))
            .all();

          if (input.status === "fulfilled") {
            for (const reservation of reservations) {
              const row = deps.db
                .select()
                .from(inventory)
                .where(and(eq(inventory.warehouseId, reservation.warehouseId), eq(inventory.productId, reservation.productId)))
                .get();
              if (!row) throw new AppError("NOT_FOUND", "库存记录不存在");
              if (row.onHand < reservation.quantity || row.reserved < reservation.quantity) {
                throw new AppError("CONFLICT", "库存预留与现存数量不一致，请先核对库存");
              }
              const update = deps.db
                .update(inventory)
                .set({
                  onHand: row.onHand - reservation.quantity,
                  reserved: row.reserved - reservation.quantity,
                  version: row.version + 1,
                })
                .where(and(eq(inventory.warehouseId, row.warehouseId), eq(inventory.productId, row.productId), eq(inventory.version, row.version)))
                .run();
              if (update.changes !== 1) throw new AppError("CONFLICT", "库存已被其他操作修改，请重试", undefined, true);
              deps.db
                .update(stockReservations)
                .set({ status: "fulfilled" })
                .where(eq(stockReservations.id, reservation.id))
                .run();
            }
            deps.db.update(orders).set({ status: "fulfilled" }).where(eq(orders.id, order.id)).run();
            return;
          }

          for (const reservation of reservations) {
            const row = deps.db
              .select()
              .from(inventory)
              .where(and(eq(inventory.warehouseId, reservation.warehouseId), eq(inventory.productId, reservation.productId)))
              .get();
            if (!row) throw new AppError("NOT_FOUND", "库存记录不存在");
            const nextReserved = Math.max(0, row.reserved - reservation.quantity);
            const update = deps.db
              .update(inventory)
              .set({ reserved: nextReserved, version: row.version + 1 })
              .where(and(eq(inventory.warehouseId, row.warehouseId), eq(inventory.productId, row.productId), eq(inventory.version, row.version)))
              .run();
            if (update.changes !== 1) throw new AppError("CONFLICT", "库存已被其他操作修改，请重试", undefined, true);
            deps.db
              .update(stockReservations)
              .set({ status: "released" })
              .where(eq(stockReservations.id, reservation.id))
              .run();
          }

          const customer = deps.db.select().from(customers).where(eq(customers.id, order.customerId)).get();
          if (customer) {
            deps.db
              .update(customers)
              .set({ creditUsedCents: Math.max(0, customer.creditUsedCents - order.totalCents) })
              .where(eq(customers.id, customer.id))
              .run();
          }

          const lines = deps.db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).all();
          for (const line of lines) {
            if (!line.quoteLineId) continue;
            const quoteLine = deps.db.select().from(quoteLines).where(eq(quoteLines.id, line.quoteLineId)).get();
            if (!quoteLine) continue;
            deps.db
              .update(quoteLines)
              .set({ convertedQuantity: Math.max(0, quoteLine.convertedQuantity - line.quantity) })
              .where(eq(quoteLines.id, quoteLine.id))
              .run();
          }

          deps.db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id)).run();

          const quote = deps.db.select().from(quotes).where(eq(quotes.id, order.quoteId)).get();
          if (!quote) return;
          const remainingLines = deps.db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).all();
          const remainingQuantity = remainingLines.reduce(
            (sum, line) => sum + Math.max(0, line.quantity - line.convertedQuantity),
            0,
          );
          if (quote.status === "converted") {
            deps.db
              .update(quotes)
              .set({ status: quote.validUntil >= Date.now() ? "approved" : "expired" })
              .where(eq(quotes.id, quote.id))
              .run();
          }
          if (quote.opportunityId) {
            deps.db
              .update(opportunities)
              .set({
                stage: "negotiation",
                nextAction:
                  remainingQuantity > 0
                    ? `订单 ${order.orderNo} 已取消，剩余 ${remainingQuantity} 件待重新转单`
                    : `订单 ${order.orderNo} 已取消，请确认是否重新报价`,
                nextActionDueAt: null,
                updatedAt: Date.now(),
              })
              .where(eq(opportunities.id, quote.opportunityId))
              .run();
          }
        })();

        const updated = deps.db.select().from(orders).where(eq(orders.id, order.id)).get()!;
        writeAudit(
          deps.db,
          actor.id,
          input.status === "cancelled" ? "cancel_order" : "fulfill_order",
          { orderId: order.id, previousStatus: order.status, reason: input.reason },
          updated,
        );
        return { ok: true, order: updated };
      }),
    );
  });
}
