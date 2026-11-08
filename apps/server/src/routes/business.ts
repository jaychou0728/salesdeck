import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, count, desc, eq, getTableColumns, inArray, like, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { AppError, type Actor } from "@salespilot/shared";
import type Database from "better-sqlite3";
import type { Db } from "../db/client.js";
import {
  afterSalesTickets,
  approvals,
  auditLogs,
  contacts,
  customers,
  followUps,
  inventory,
  orderLines,
  orders,
  products,
  quoteLines,
  quotes,
  stockReservations,
  traceEvents,
  traces,
  users,
  warehouses,
} from "../db/schema.js";
import { customerScope, resolveActor, scopedOwnerIds } from "../lib/actor.js";
import { executeTool, toolMap } from "../tools/index.js";
import { assertManager } from "../domain/permissions.js";
import { buildCustomerAssessment, listOpportunityViews } from "../domain/workspace.js";

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  AMBIGUOUS_ENTITY: 400,
  OUT_OF_STOCK: 400,
  CREDIT_EXCEEDED: 400,
  PRICE_FLOOR: 400,
  FORBIDDEN: 403,
  CONFLICT: 409,
  INVALID_STATE: 400,
  TOKEN_EXPIRED: 400,
  TIMEOUT: 504,
  PROVIDER_ERROR: 500,
};

const INVENTORY_ADJUST = z.object({
  warehouseId: z.string().min(1),
  productId: z.string().min(1),
  delta: z.number().int().refine((value) => value !== 0, { message: "delta 不能为 0" }),
  reason: z.string().min(2),
});

const INVENTORY_TRANSFER = z.object({
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const QUOTE_PREVIEW = z.object({
  customerId: z.string().min(1),
  contactId: z.string().min(1),
  opportunityId: z.string().min(1).optional(),
  lines: z
    .array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1)
    .max(50),
  validDays: z.number().int().min(1).max(30).optional(),
  notes: z.string().max(500).optional(),
  actorId: z.string().optional(),
});

const COMMIT = z.object({
  token: z.string().min(10),
  payload: z.record(z.unknown()),
  idempotencyKey: z.string().min(8).max(100),
  actorId: z.string().optional(),
});

const CONVERT_COMMIT = COMMIT;

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "请求参数不合法", parsed.error.issues);
  }
  return parsed.data;
}

function parseJson(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.code(ERROR_STATUS[error.code] ?? 400).send({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        suggestedAction: error.suggestedAction,
      },
    });
  }
  reply.log.error(error);
  return reply.code(500).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "服务器内部错误" } });
}

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> | unknown;

function handle(fn: Handler) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(request, reply);
    } catch (error) {
      return sendError(reply, error);
    }
  };
}

function assertOwned(ownerId: string, ownerIds: string[]) {
  if (!ownerIds.includes(ownerId)) {
    throw new AppError("FORBIDDEN", "无权访问该资源");
  }
}

function creditInfo(customer: { creditLimitCents: number; creditUsedCents: number }) {
  const availableCents = customer.creditLimitCents - customer.creditUsedCents;
  return {
    limitCents: customer.creditLimitCents,
    usedCents: customer.creditUsedCents,
    availableCents,
    utilization: customer.creditLimitCents > 0 ? customer.creditUsedCents / customer.creditLimitCents : 0,
  };
}

function inventoryView(row: {
  warehouseId: string;
  productId: string;
  onHand: number;
  reserved: number;
  safetyStock: number;
  etaDays: number;
  version: number;
}) {
  const available = row.onHand - row.reserved;
  return { ...row, available, lowStock: available < row.safetyStock };
}

const PRODUCT_PUBLIC_COLUMNS = {
  id: products.id,
  sku: products.sku,
  name: products.name,
  category: products.category,
  unit: products.unit,
  listPriceCents: products.listPriceCents,
  floorPriceCents: products.floorPriceCents,
  taxRateBps: products.taxRateBps,
  status: products.status,
};

export function registerBusiness(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  const actorOf = (request: FastifyRequest) => resolveActor(deps.db, request);

  const toolContext = (actor: Actor, traceId: string) => ({
    db: deps.db,
    sqlite: deps.sqlite,
    actor,
    traceId,
    emit: () => {},
  });

  const approvalView = (row: typeof approvals.$inferSelect, db: Db) => {
    const quote = row.targetType === "quote" ? db.select().from(quotes).where(eq(quotes.id, row.targetId)).get() : undefined;
    const customer = quote ? db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.id, quote.customerId)).get() : undefined;
    const requester = db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, row.requesterId)).get();
    const approver = row.approverId ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, row.approverId)).get() : undefined;
    return {
      id: row.id,
      type: row.type,
      targetType: row.targetType,
      targetId: row.targetId,
      status: row.status,
      reason: row.reason,
      comment: row.comment,
      requesterId: row.requesterId,
      requesterName: requester?.name ?? null,
      approverId: row.approverId,
      approverName: approver?.name ?? null,
      amountCents: quote?.totalCents ?? 0,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      payload: parseJson(row.payloadJson, {}),
    };
  };

  app.after(() => {
    app.get(
      "/api/business/me",
      { schema: { tags: ["business"], summary: "Current actor profile and permissions" } },
      handle(async (request) => {
        const actor = actorOf(request);
        return {
          ok: true,
          actor: { id: actor.id, name: actor.name, role: actor.role, teamId: actor.teamId },
          permissions: {
            scope: actor.role === "manager" ? "team" : "self",
            canApprove: actor.role === "manager",
            canAdjustInventory: actor.role === "manager",
          },
        };
      }),
    );

    app.get(
      "/api/business/dashboard",
      { schema: { tags: ["business"], summary: "Scoped workspace metrics, alerts and recent activity" } },
      handle(async (request) => {
        const actor = actorOf(request);
        const db = deps.db;
        const ownerIds = scopedOwnerIds(db, actor);
        const customersCount = db.select({ value: count() }).from(customers).where(customerScope(actor, db)).get()?.value ?? 0;
        const openQuotes =
          db
            .select({ value: count() })
            .from(quotes)
            .where(and(inArray(quotes.ownerId, ownerIds), inArray(quotes.status, ["draft", "pending_approval", "approved"])))
            .get()?.value ?? 0;
        const pendingApprovals =
          db
            .select({ value: count() })
            .from(approvals)
            .where(and(inArray(approvals.requesterId, ownerIds), eq(approvals.status, "pending")))
            .get()?.value ?? 0;
        const lowStock = db
          .select({ onHand: inventory.onHand, reserved: inventory.reserved, safetyStock: inventory.safetyStock })
          .from(inventory)
          .all()
          .filter((row) => row.onHand - row.reserved < row.safetyStock).length;
        const openTickets = db
          .select({ id: afterSalesTickets.id })
          .from(afterSalesTickets)
          .innerJoin(customers, eq(afterSalesTickets.customerId, customers.id))
          .where(and(inArray(customers.ownerId, ownerIds), inArray(afterSalesTickets.status, ["open", "processing"])))
          .all().length;

        const briefing = await executeTool(toolMap.get("get_sales_briefing")!, toolContext(actor, "dashboard"), {
          scope: actor.role === "manager" ? "team" : "self",
        });
        const alerts = briefing.model.ok ? ((briefing.model.data as { alerts: unknown[] }).alerts ?? []) : [];

        const recentQuoteRows = db
          .select({ ...getTableColumns(quotes), customerName: customers.name, ownerName: users.name })
          .from(quotes)
          .innerJoin(customers, eq(quotes.customerId, customers.id))
          .leftJoin(users, eq(quotes.ownerId, users.id))
          .where(inArray(quotes.ownerId, ownerIds))
          .orderBy(desc(quotes.createdAt))
          .limit(5)
          .all();
        const recentOrderRows = db
          .select({ ...getTableColumns(orders), customerName: customers.name, ownerName: users.name })
          .from(orders)
          .innerJoin(customers, eq(orders.customerId, customers.id))
          .leftJoin(users, eq(orders.ownerId, users.id))
          .where(inArray(orders.ownerId, ownerIds))
          .orderBy(desc(orders.createdAt))
          .limit(5)
          .all();

        return {
          ok: true,
          metrics: {
            customers: customersCount,
            openQuotes,
            pendingApprovals,
            lowStock,
            openTickets,
          },
          alerts,
          recentQuotes: recentQuoteRows,
          recentOrders: recentOrderRows,
        };
      }),
    );

    app.get(
      "/api/business/customers",
      {
        schema: {
          tags: ["business"],
          summary: "List customers visible to the current actor",
          querystring: { type: "object", properties: { q: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const conditions: SQL[] = [customerScope(actor, deps.db)];
        const q = (request.query as { q?: string }).q?.trim();
        if (q) {
          const term = `%${q}%`;
          conditions.push(or(like(customers.name, term), like(customers.region, term))!);
        }
        const rows = deps.db
          .select({ ...getTableColumns(customers), ownerName: users.name })
          .from(customers)
          .leftJoin(users, eq(customers.ownerId, users.id))
          .where(and(...conditions))
          .all()
          .map((row) => ({ ...row, creditUtilization: row.creditLimitCents > 0 ? row.creditUsedCents / row.creditLimitCents : 0 }));
        return { ok: true, customers: rows };
      }),
    );

    app.get(
      "/api/business/customers/:id",
      {
        schema: {
          tags: ["business"],
          summary: "Customer 360 with contacts, credit, quotes, orders and tickets",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const customer = deps.db
          .select({ ...getTableColumns(customers), ownerName: users.name })
          .from(customers)
          .leftJoin(users, eq(customers.ownerId, users.id))
          .where(eq(customers.id, id))
          .get();
        if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
        assertOwned(customer.ownerId, scopedOwnerIds(deps.db, actor));

        const contactRows = deps.db.select().from(contacts).where(eq(contacts.customerId, id)).all();
        const quoteRows = deps.db.select().from(quotes).where(eq(quotes.customerId, id)).orderBy(desc(quotes.createdAt)).limit(5).all();
        const orderRows = deps.db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt)).limit(5).all();
        const ticketRows = deps.db
          .select()
          .from(afterSalesTickets)
          .where(eq(afterSalesTickets.customerId, id))
          .orderBy(desc(afterSalesTickets.createdAt))
          .limit(5)
          .all();
        return {
          ok: true,
          customer,
          contacts: contactRows,
          credit: creditInfo(customer),
          quotes: quoteRows,
          orders: orderRows,
          tickets: ticketRows,
          opportunities: listOpportunityViews(deps.db, actor, { customerId: id }),
          followUps: deps.db
            .select()
            .from(followUps)
            .where(eq(followUps.customerId, id))
            .orderBy(desc(followUps.createdAt))
            .limit(20)
            .all(),
          assessment: buildCustomerAssessment(deps.db, actor, id),
        };
      }),
    );

    app.get(
      "/api/business/inventory",
      {
        schema: {
          tags: ["business"],
          summary: "List inventory with availability and low-stock flags",
          querystring: { type: "object", properties: { q: { type: "string" } } },
        },
      },
      handle(async (request) => {
        actorOf(request);
        const conditions: SQL[] = [];
        const q = (request.query as { q?: string }).q?.trim();
        if (q) {
          const term = `%${q}%`;
          conditions.push(or(like(products.name, term), like(products.sku, term), like(warehouses.name, term))!);
        }
        const rows = deps.db
          .select({
            warehouseId: inventory.warehouseId,
            productId: inventory.productId,
            onHand: inventory.onHand,
            reserved: inventory.reserved,
            safetyStock: inventory.safetyStock,
            etaDays: inventory.etaDays,
            version: inventory.version,
            productName: products.name,
            sku: products.sku,
            category: products.category,
            unit: products.unit,
            listPriceCents: products.listPriceCents,
            warehouseName: warehouses.name,
            region: warehouses.region,
          })
          .from(inventory)
          .innerJoin(products, eq(inventory.productId, products.id))
          .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
          .where(conditions.length ? and(...conditions) : undefined)
          .all()
          .map(inventoryView);
        return { ok: true, inventory: rows };
      }),
    );

    app.post(
      "/api/business/inventory/adjust",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Adjust on-hand inventory (manager only)",
          body: {
            type: "object",
            required: ["warehouseId", "productId", "delta", "reason"],
            properties: {
              warehouseId: { type: "string" },
              productId: { type: "string" },
              delta: { type: "integer" },
              reason: { type: "string" },
            },
          },
          response: { 200: { type: "object", additionalProperties: true }, 400: { type: "object", additionalProperties: true }, 403: { type: "object", additionalProperties: true } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        assertManager(actor);
        const input = parseBody(INVENTORY_ADJUST, request.body);
        const product = deps.db.select().from(products).where(eq(products.id, input.productId)).get();
        if (!product) throw new AppError("NOT_FOUND", "产品不存在");
        const warehouse = deps.db.select().from(warehouses).where(eq(warehouses.id, input.warehouseId)).get();
        if (!warehouse) throw new AppError("NOT_FOUND", "仓库不存在");

        const started = Date.now();
        const row = deps.db.transaction((tx) => {
          const current = tx
            .select()
            .from(inventory)
            .where(and(eq(inventory.warehouseId, input.warehouseId), eq(inventory.productId, input.productId)))
            .get();
          if (!current) throw new AppError("NOT_FOUND", "库存记录不存在");
          const nextOnHand = current.onHand + input.delta;
          if (nextOnHand < 0 || nextOnHand < current.reserved) {
            throw new AppError("INVALID_STATE", "调整后库存不能小于 0 或低于已预留数量", {
              onHand: current.onHand,
              reserved: current.reserved,
              delta: input.delta,
            });
          }
          const update = tx
            .update(inventory)
            .set({ onHand: nextOnHand, version: current.version + 1 })
            .where(
              and(
                eq(inventory.warehouseId, input.warehouseId),
                eq(inventory.productId, input.productId),
                eq(inventory.version, current.version),
              ),
            )
            .run();
          if (update.changes !== 1) {
            throw new AppError("CONFLICT", "库存已被其他操作修改，请重试", undefined, true);
          }
          const detail = {
            warehouseId: input.warehouseId,
            productId: input.productId,
            onHand: nextOnHand,
            reserved: current.reserved,
            safetyStock: current.safetyStock,
            etaDays: current.etaDays,
            version: current.version + 1,
            productName: product.name,
            sku: product.sku,
            warehouseName: warehouse.name,
            region: warehouse.region,
            available: nextOnHand - current.reserved,
            lowStock: nextOnHand - current.reserved < current.safetyStock,
          };
          tx.insert(auditLogs)
            .values({
              id: `audit_${randomUUID()}`,
              traceId: `manual_inventory_${randomUUID()}`,
              actorId: actor.id,
              toolName: "inventory_adjust",
              argsJson: JSON.stringify({ warehouseId: input.warehouseId, productId: input.productId, delta: input.delta, reason: input.reason }),
              resultJson: JSON.stringify(detail),
              status: "ok",
              latencyMs: Date.now() - started,
              createdAt: Date.now(),
            })
            .run();
          return detail;
        });
        return { ok: true, row };
      }),
    );

    app.post(
      "/api/business/inventory/transfer",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Transfer stock between warehouses (manager only)",
          body: {
            type: "object",
            required: ["fromWarehouseId", "toWarehouseId", "productId", "quantity"],
            properties: {
              fromWarehouseId: { type: "string" },
              toWarehouseId: { type: "string" },
              productId: { type: "string" },
              quantity: { type: "integer" },
            },
          },
          response: { 200: { type: "object", additionalProperties: true }, 400: { type: "object", additionalProperties: true }, 403: { type: "object", additionalProperties: true } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        assertManager(actor);
        const input = parseBody(INVENTORY_TRANSFER, request.body);
        if (input.fromWarehouseId === input.toWarehouseId) {
          throw new AppError("VALIDATION_ERROR", "源仓与目标仓不能相同");
        }
        const product = deps.db.select().from(products).where(eq(products.id, input.productId)).get();
        if (!product) throw new AppError("NOT_FOUND", "产品不存在");
        const fromWarehouse = deps.db.select().from(warehouses).where(eq(warehouses.id, input.fromWarehouseId)).get();
        const toWarehouse = deps.db.select().from(warehouses).where(eq(warehouses.id, input.toWarehouseId)).get();
        if (!fromWarehouse) throw new AppError("NOT_FOUND", "源仓库不存在");
        if (!toWarehouse) throw new AppError("NOT_FOUND", "目标仓库不存在");

        const started = Date.now();
        const result = deps.db.transaction((tx) => {
          const source = tx
            .select()
            .from(inventory)
            .where(and(eq(inventory.warehouseId, input.fromWarehouseId), eq(inventory.productId, input.productId)))
            .get();
          if (!source) throw new AppError("NOT_FOUND", "源仓库存记录不存在");
          const target = tx
            .select()
            .from(inventory)
            .where(and(eq(inventory.warehouseId, input.toWarehouseId), eq(inventory.productId, input.productId)))
            .get();
          if (!target) throw new AppError("NOT_FOUND", "目标仓库存记录不存在");
          if (source.onHand - source.reserved < input.quantity) {
            throw new AppError("OUT_OF_STOCK", "源仓可用库存不足", {
              available: source.onHand - source.reserved,
              quantity: input.quantity,
            });
          }
          const sourceUpdate = tx
            .update(inventory)
            .set({ onHand: source.onHand - input.quantity, version: source.version + 1 })
            .where(
              and(
                eq(inventory.warehouseId, input.fromWarehouseId),
                eq(inventory.productId, input.productId),
                eq(inventory.version, source.version),
              ),
            )
            .run();
          if (sourceUpdate.changes !== 1) throw new AppError("CONFLICT", "源仓库存已被其他操作修改，请重试", undefined, true);
          const targetUpdate = tx
            .update(inventory)
            .set({ onHand: target.onHand + input.quantity, version: target.version + 1 })
            .where(
              and(
                eq(inventory.warehouseId, input.toWarehouseId),
                eq(inventory.productId, input.productId),
                eq(inventory.version, target.version),
              ),
            )
            .run();
          if (targetUpdate.changes !== 1) throw new AppError("CONFLICT", "目标仓库存已被其他操作修改，请重试", undefined, true);

          const from = {
            warehouseId: input.fromWarehouseId,
            warehouseName: fromWarehouse.name,
            productId: input.productId,
            sku: product.sku,
            productName: product.name,
            onHand: source.onHand - input.quantity,
            reserved: source.reserved,
            available: source.onHand - input.quantity - source.reserved,
          };
          const to = {
            warehouseId: input.toWarehouseId,
            warehouseName: toWarehouse.name,
            productId: input.productId,
            sku: product.sku,
            productName: product.name,
            onHand: target.onHand + input.quantity,
            reserved: target.reserved,
            available: target.onHand + input.quantity - target.reserved,
          };
          tx.insert(auditLogs)
            .values({
              id: `audit_${randomUUID()}`,
              traceId: `manual_inventory_${randomUUID()}`,
              actorId: actor.id,
              toolName: "inventory_transfer",
              argsJson: JSON.stringify({
                fromWarehouseId: input.fromWarehouseId,
                toWarehouseId: input.toWarehouseId,
                productId: input.productId,
                quantity: input.quantity,
              }),
              resultJson: JSON.stringify({ from, to }),
              status: "ok",
              latencyMs: Date.now() - started,
              createdAt: Date.now(),
            })
            .run();
          return { from, to };
        });
        return { ok: true, ...result };
      }),
    );

    app.get(
      "/api/business/quotes",
      {
        schema: {
          tags: ["business"],
          summary: "List quotes visible to the current actor",
          querystring: { type: "object", properties: { status: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const ownerIds = scopedOwnerIds(deps.db, actor);
        const conditions: SQL[] = [inArray(quotes.ownerId, ownerIds)];
        const status = (request.query as { status?: string }).status;
        if (status) conditions.push(eq(quotes.status, status));
        const rows = deps.db
          .select({ ...getTableColumns(quotes), customerName: customers.name, ownerName: users.name })
          .from(quotes)
          .innerJoin(customers, eq(quotes.customerId, customers.id))
          .leftJoin(users, eq(quotes.ownerId, users.id))
          .where(and(...conditions))
          .orderBy(desc(quotes.createdAt))
          .limit(50)
          .all();
        return { ok: true, quotes: rows };
      }),
    );

    app.get(
      "/api/business/quotes/:id",
      {
        schema: {
          tags: ["business"],
          summary: "Quote detail with customer, contact, lines and approval",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const quote = deps.db.select().from(quotes).where(eq(quotes.id, id)).get();
        if (!quote) throw new AppError("NOT_FOUND", "报价不存在");
        assertOwned(quote.ownerId, scopedOwnerIds(deps.db, actor));
        const customer = deps.db.select().from(customers).where(eq(customers.id, quote.customerId)).get() ?? null;
        const contact = deps.db.select().from(contacts).where(eq(contacts.id, quote.contactId)).get() ?? null;
        const lines = deps.db
          .select({ ...getTableColumns(quoteLines), productName: products.name, sku: products.sku })
          .from(quoteLines)
          .leftJoin(products, eq(quoteLines.productId, products.id))
          .where(eq(quoteLines.quoteId, quote.id))
          .all();
        const approval =
          deps.db
            .select()
            .from(approvals)
            .where(and(eq(approvals.targetType, "quote"), eq(approvals.targetId, quote.id)))
            .orderBy(desc(approvals.createdAt))
            .get() ?? null;
        const owner = deps.db.select({ name: users.name }).from(users).where(eq(users.id, quote.ownerId)).get();
        return { ok: true, quote: { ...quote, ownerName: owner?.name ?? null }, customer, contact, lines, approval };
      }),
    );

    app.post(
      "/api/business/quotes/preview",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Preview a manual quote with server-side pricing and a confirmation token",
          body: {
            type: "object",
            required: ["customerId", "contactId", "lines"],
            properties: {
              customerId: { type: "string" },
              contactId: { type: "string" },
              lines: { type: "array", items: { type: "object", additionalProperties: true } },
              validDays: { type: "integer" },
              notes: { type: "string" },
            },
          },
        },
      },
      handle(async (request, reply) => {
        const actor = actorOf(request);
        const input = parseBody(QUOTE_PREVIEW, request.body);
        const outcome = await executeTool(toolMap.get("create_quote")!, toolContext(actor, `manual_quote_${randomUUID()}`), {
          customerId: input.customerId,
          contactId: input.contactId,
          opportunityId: input.opportunityId,
          lines: input.lines,
          validDays: input.validDays ?? 7,
          notes: input.notes,
          dryRun: true,
        });
        if (!outcome.model.ok) {
          return reply.code(400).send({ ok: false, error: outcome.model.error });
        }
        const artifact = outcome.artifacts?.[0] as
          | { payload?: { preview?: unknown; input?: unknown }; confirmationToken?: string }
          | undefined;
        if (!artifact) {
          return reply.code(400).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "工具未返回预览" } });
        }
        return {
          ok: true,
          preview: artifact.payload?.preview,
          input: artifact.payload?.input,
          confirmationToken: artifact.confirmationToken,
        };
      }),
    );

    app.post(
      "/api/business/quotes/commit",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Commit a previewed manual quote",
          body: {
            type: "object",
            required: ["token", "payload", "idempotencyKey"],
            properties: {
              token: { type: "string" },
              payload: { type: "object" },
              idempotencyKey: { type: "string" },
            },
          },
        },
      },
      handle(async (request, reply) => {
        const actor = actorOf(request);
        const input = parseBody(COMMIT, request.body);
        const outcome = await executeTool(toolMap.get("create_quote")!, toolContext(actor, `manual_quote_${randomUUID()}`), {
          ...input.payload,
          dryRun: false,
          confirmationToken: input.token,
          idempotencyKey: input.idempotencyKey,
        });
        return reply.code(outcome.model.ok ? 200 : 400).send(outcome.model);
      }),
    );

    app.post(
      "/api/business/quotes/:id/convert-preview",
      {
        schema: {
          tags: ["business"],
          summary: "Preview converting a quote to an order",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request, reply) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const outcome = await executeTool(toolMap.get("convert_quote_to_order")!, toolContext(actor, `manual_convert_${randomUUID()}`), {
          quoteId: id,
          dryRun: true,
        });
        if (!outcome.model.ok) {
          return reply.code(400).send({ ok: false, error: outcome.model.error });
        }
        const artifact = outcome.artifacts?.[0] as
          | { payload?: { preview?: unknown; input?: unknown }; confirmationToken?: string }
          | undefined;
        if (!artifact) {
          return reply.code(400).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "工具未返回预览" } });
        }
        return {
          ok: true,
          preview: artifact.payload?.preview,
          input: artifact.payload?.input,
          confirmationToken: artifact.confirmationToken,
        };
      }),
    );

    app.post(
      "/api/business/quotes/:id/convert",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Commit converting a quote to an order",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
          body: {
            type: "object",
            required: ["token", "payload", "idempotencyKey"],
            properties: {
              token: { type: "string" },
              payload: { type: "object" },
              idempotencyKey: { type: "string" },
            },
          },
        },
      },
      handle(async (request, reply) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const input = parseBody(CONVERT_COMMIT, request.body);
        const outcome = await executeTool(toolMap.get("convert_quote_to_order")!, toolContext(actor, `manual_convert_${randomUUID()}`), {
          ...input.payload,
          quoteId: id,
          dryRun: false,
          confirmationToken: input.token,
          idempotencyKey: input.idempotencyKey,
        });
        return reply.code(outcome.model.ok ? 200 : 400).send(outcome.model);
      }),
    );

    app.get(
      "/api/business/orders",
      {
        schema: {
          tags: ["business"],
          summary: "List orders visible to the current actor",
          querystring: { type: "object", properties: { status: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const ownerIds = scopedOwnerIds(deps.db, actor);
        const conditions: SQL[] = [inArray(orders.ownerId, ownerIds)];
        const status = (request.query as { status?: string }).status;
        if (status) conditions.push(eq(orders.status, status));
        const rows = deps.db
          .select({ ...getTableColumns(orders), customerName: customers.name, ownerName: users.name })
          .from(orders)
          .innerJoin(customers, eq(orders.customerId, customers.id))
          .leftJoin(users, eq(orders.ownerId, users.id))
          .where(and(...conditions))
          .orderBy(desc(orders.createdAt))
          .limit(50)
          .all();
        return { ok: true, orders: rows };
      }),
    );

    app.get(
      "/api/business/orders/:id",
      {
        schema: {
          tags: ["business"],
          summary: "Order detail with lines and stock reservations",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const order = deps.db.select().from(orders).where(eq(orders.id, id)).get();
        if (!order) throw new AppError("NOT_FOUND", "订单不存在");
        assertOwned(order.ownerId, scopedOwnerIds(deps.db, actor));
        const customer = deps.db.select().from(customers).where(eq(customers.id, order.customerId)).get() ?? null;
        const lines = deps.db
          .select({ ...getTableColumns(orderLines), productName: products.name, sku: products.sku })
          .from(orderLines)
          .leftJoin(products, eq(orderLines.productId, products.id))
          .where(eq(orderLines.orderId, order.id))
          .all();
        const reservations = deps.db
          .select({ ...getTableColumns(stockReservations), warehouseName: warehouses.name })
          .from(stockReservations)
          .leftJoin(warehouses, eq(stockReservations.warehouseId, warehouses.id))
          .where(eq(stockReservations.orderId, order.id))
          .all();
        const owner = deps.db.select({ name: users.name }).from(users).where(eq(users.id, order.ownerId)).get();
        return { ok: true, order: { ...order, ownerName: owner?.name ?? null }, customer, lines, reservations };
      }),
    );

    app.get(
      "/api/business/tickets",
      {
        schema: { tags: ["business"], summary: "List after-sales tickets visible to the current actor" },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const ownerIds = scopedOwnerIds(deps.db, actor);
        const rows = deps.db
          .select({ ...getTableColumns(afterSalesTickets), customerName: customers.name, productName: products.name })
          .from(afterSalesTickets)
          .innerJoin(customers, eq(afterSalesTickets.customerId, customers.id))
          .leftJoin(products, eq(afterSalesTickets.productId, products.id))
          .where(inArray(customers.ownerId, ownerIds))
          .orderBy(desc(afterSalesTickets.createdAt))
          .limit(50)
          .all();
        return { ok: true, tickets: rows };
      }),
    );

    app.get(
      "/api/business/tickets/:id",
      {
        schema: {
          tags: ["business"],
          summary: "After-sales ticket detail",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const ticket = deps.db.select().from(afterSalesTickets).where(eq(afterSalesTickets.id, id)).get();
        if (!ticket) throw new AppError("NOT_FOUND", "工单不存在");
        const customer = deps.db.select().from(customers).where(eq(customers.id, ticket.customerId)).get();
        if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
        assertOwned(customer.ownerId, scopedOwnerIds(deps.db, actor));
        const product = deps.db.select(PRODUCT_PUBLIC_COLUMNS).from(products).where(eq(products.id, ticket.productId)).get() ?? null;
        const order = ticket.orderId ? (deps.db.select().from(orders).where(eq(orders.id, ticket.orderId)).get() ?? null) : null;
        return { ok: true, ticket, customer, order, product };
      }),
    );

    app.get(
      "/api/business/approvals",
      {
        schema: { tags: ["business"], summary: "List approvals visible to the current actor" },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const ownerIds = scopedOwnerIds(deps.db, actor);
        const rows = deps.db
          .select()
          .from(approvals)
          .where(inArray(approvals.requesterId, ownerIds))
          .orderBy(desc(approvals.createdAt))
          .limit(100)
          .all()
          .map((row) => approvalView(row, deps.db));
        return { ok: true, approvals: rows };
      }),
    );

    app.get(
      "/api/business/approvals/:id",
      {
        schema: {
          tags: ["business"],
          summary: "Approval detail",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const row = deps.db.select().from(approvals).where(eq(approvals.id, id)).get();
        if (!row) throw new AppError("NOT_FOUND", "审批不存在");
        assertOwned(row.requesterId, scopedOwnerIds(deps.db, actor));
        return { ok: true, approval: approvalView(row, deps.db) };
      }),
    );

    app.get(
      "/api/business/traces",
      {
        schema: { tags: ["business"], summary: "Recent traces visible to the current actor (max 50)" },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const ownerIds = scopedOwnerIds(deps.db, actor);
        const rows = deps.db
          .select()
          .from(traces)
          .where(inArray(traces.actorId, ownerIds))
          .orderBy(desc(traces.startedAt))
          .limit(50)
          .all();
        return { ok: true, traces: rows };
      }),
    );

    app.get(
      "/api/business/traces/:id",
      {
        schema: {
          tags: ["business"],
          summary: "Trace detail with ordered events",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const trace = deps.db.select().from(traces).where(eq(traces.id, id)).get();
        if (!trace) throw new AppError("NOT_FOUND", "Trace 不存在");
        assertOwned(trace.actorId, scopedOwnerIds(deps.db, actor));
        const events = deps.db
          .select()
          .from(traceEvents)
          .where(eq(traceEvents.traceId, trace.id))
          .orderBy(traceEvents.seq)
          .all()
          .map((event) => ({ ...event, payload: parseJson(event.payloadJson, {}) }));
        return { ok: true, trace, events };
      }),
    );

    app.get(
      "/api/business/audit",
      {
        schema: { tags: ["business"], summary: "Recent audit log entries visible to the current actor (max 100)" },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const ownerIds = scopedOwnerIds(deps.db, actor);
        const rows = deps.db
          .select({ ...getTableColumns(auditLogs), actorName: users.name })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.actorId, users.id))
          .where(inArray(auditLogs.actorId, ownerIds))
          .orderBy(desc(auditLogs.createdAt))
          .limit(100)
          .all()
          .map((row) => ({
            id: row.id,
            traceId: row.traceId,
            actorId: row.actorId,
            actorName: row.actorName ?? null,
            toolName: row.toolName,
            args: parseJson(row.argsJson, null),
            result: parseJson(row.resultJson, null),
            status: row.status,
            latencyMs: row.latencyMs,
            createdAt: row.createdAt,
          }));
        return { ok: true, audit: rows };
      }),
    );
  });
}
