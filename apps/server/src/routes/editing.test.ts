import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { buildApp } from "../app.js";
import { MockProvider } from "../agent/mockProvider.js";
import {
  afterSalesTickets,
  approvals,
  auditLogs,
  contacts,
  customers,
  inventory,
  orderLines,
  quoteLines,
  stockReservations,
} from "../db/schema.js";

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  const app = buildApp({ db, sqlite, provider: new MockProvider() });
  return { app, db, sqlite };
}

const as = (id: string) => ({ "x-actor-id": id });
const sales = "u_sales_lin";
const manager = "u_manager_wang";

async function createConvertedOrder(app: ReturnType<typeof buildApp>, quantity = 2) {
  const preview = await app.inject({
    method: "POST",
    url: "/api/business/quotes/preview",
    headers: as(sales),
    payload: { customerId: "c_huachen", contactId: "ct_zhang_1", lines: [{ sku: "X1", quantity }] },
  });
  expect(preview.statusCode).toBe(200);
  const previewBody = preview.json();
  const quoteCommit = await app.inject({
    method: "POST",
    url: "/api/business/quotes/commit",
    headers: as(sales),
    payload: { token: previewBody.confirmationToken, payload: previewBody.input, idempotencyKey: `idem_${randomUUID()}` },
  });
  expect(quoteCommit.statusCode).toBe(200);
  const quoteId = quoteCommit.json().data.quote.id as string;

  const convertPreview = await app.inject({
    method: "POST",
    url: `/api/business/quotes/${quoteId}/convert-preview`,
    headers: as(sales),
  });
  expect(convertPreview.statusCode).toBe(200);
  const convertBody = convertPreview.json();
  const convert = await app.inject({
    method: "POST",
    url: `/api/business/quotes/${quoteId}/convert`,
    headers: as(sales),
    payload: { token: convertBody.confirmationToken, payload: convertBody.input, idempotencyKey: `idem_${randomUUID()}` },
  });
  expect(convert.statusCode).toBe(200);
  expect(convert.json().data.status).toBe("committed");
  return { quoteId, orderId: convert.json().data.order.id as string };
}

describe("editing business data", () => {
  it("lets a manager adjust credit limits directly and supersedes pending requests", async () => {
    const { app, db } = setup();
    const request = await app.inject({
      method: "POST",
      url: "/api/business/customers/c_huachen/credit-limit-requests",
      headers: as(sales),
      payload: { requestedLimitCents: 130_000_000, reason: "业务增长需要提额" },
    });
    expect(request.statusCode).toBe(200);
    const approvalId = request.json().approvalId as string;

    const adjust = await app.inject({
      method: "PATCH",
      url: "/api/business/customers/c_huachen/credit-limit",
      headers: as(manager),
      payload: { limitCents: 150_000_000, reason: "季度资信复核上调" },
    });
    expect(adjust.statusCode).toBe(200);
    expect(adjust.json().creditLimitCents).toBe(150_000_000);

    const customer = db.select().from(customers).where(eq(customers.id, "c_huachen")).get();
    expect(customer!.creditLimitCents).toBe(150_000_000);
    const approval = db.select().from(approvals).where(eq(approvals.id, approvalId)).get();
    expect(approval!.status).toBe("rejected");
    expect(approval!.comment).toContain("直接调整");
    expect(
      db.select().from(auditLogs).where(and(eq(auditLogs.actorId, manager), eq(auditLogs.toolName, "update_credit_limit"))).all(),
    ).toHaveLength(1);

    const tooLow = await app.inject({
      method: "PATCH",
      url: "/api/business/customers/c_huachen/credit-limit",
      headers: as(manager),
      payload: { limitCents: 1, reason: "测试下限" },
    });
    expect(tooLow.statusCode).toBe(400);

    const forbidden = await app.inject({
      method: "PATCH",
      url: "/api/business/customers/c_huachen/credit-limit",
      headers: as(sales),
      payload: { limitCents: 150_000_000, reason: "销售不能直接调额" },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("lets sales edit own customer basics while manager controls level and owner", async () => {
    const { app, db } = setup();
    const own = await app.inject({
      method: "PATCH",
      url: "/api/business/customers/c_huachen",
      headers: as(sales),
      payload: { name: "华辰设计（新）", region: "杭州", paymentTerms: "月结 45 天" },
    });
    expect(own.statusCode).toBe(200);
    expect(own.json().customer.name).toBe("华辰设计（新）");

    const level = await app.inject({
      method: "PATCH",
      url: "/api/business/customers/c_huachen",
      headers: as(sales),
      payload: { level: "B" },
    });
    expect(level.statusCode).toBe(403);

    const managed = await app.inject({
      method: "PATCH",
      url: "/api/business/customers/c_huachen",
      headers: as(manager),
      payload: { level: "B", ownerId: "u_sales_wang", status: "inactive" },
    });
    expect(managed.statusCode).toBe(200);
    expect(managed.json().customer.ownerId).toBe("u_sales_wang");
    expect(managed.json().customer.status).toBe("inactive");

    const otherTeam = await app.inject({
      method: "PATCH",
      url: "/api/business/customers/c_zhihang",
      headers: as(sales),
      payload: { name: "越权修改" },
    });
    expect(otherTeam.statusCode).toBe(403);
    expect(db.select().from(customers).where(eq(customers.id, "c_zhihang")).get()!.name).toBe("智航电子");
  });

  it("supports creating, updating and deleting contacts with a single primary", async () => {
    const { app, db } = setup();
    const created = await app.inject({
      method: "POST",
      url: "/api/business/customers/c_huachen/contacts",
      headers: as(sales),
      payload: { name: "王助理", title: "采购助理", phone: "13800000000", email: "wang@huachen.example", isPrimary: true },
    });
    expect(created.statusCode).toBe(200);
    const contactId = created.json().contact.id as string;
    expect(created.json().contact.isPrimary).toBe(true);
    expect(db.select().from(contacts).where(eq(contacts.id, "ct_zhang_1")).get()!.isPrimary).toBe(false);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/business/contacts/${contactId}`,
      headers: as(sales),
      payload: { title: "采购经理" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().contact.title).toBe("采购经理");

    const removed = await app.inject({ method: "DELETE", url: `/api/business/contacts/${contactId}`, headers: as(sales) });
    expect(removed.statusCode).toBe(200);
    expect(db.select().from(contacts).where(eq(contacts.id, contactId)).get()).toBeUndefined();
    expect(db.select().from(contacts).where(eq(contacts.customerId, "c_huachen")).all().some((row) => row.isPrimary)).toBe(true);

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/business/customers/c_zhihang/contacts",
      headers: as(sales),
      payload: { name: "越权", title: "测试" },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("moves an after-sales ticket through processing, resolved and closed", async () => {
    const { app, db } = setup();
    db.insert(afterSalesTickets)
      .values({
        id: "t_edit_1",
        ticketNo: "AS-2026-9001",
        customerId: "c_huachen",
        orderId: null,
        productId: "p_x1",
        serialNo: null,
        issueType: "DOA",
        description: "开箱无法开机",
        status: "open",
        policyRefs: "[]",
        resolution: null,
        createdAt: Date.now(),
      })
      .run();

    const started = await app.inject({
      method: "PATCH",
      url: "/api/business/tickets/t_edit_1",
      headers: as(sales),
      payload: { status: "processing" },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().ticket.status).toBe("processing");

    const missingResolution = await app.inject({
      method: "PATCH",
      url: "/api/business/tickets/t_edit_1",
      headers: as(sales),
      payload: { status: "resolved" },
    });
    expect(missingResolution.statusCode).toBe(400);

    const resolved = await app.inject({
      method: "PATCH",
      url: "/api/business/tickets/t_edit_1",
      headers: as(sales),
      payload: { status: "resolved", resolution: "已安排换机，客户确认收货" },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().ticket.resolution).toContain("换机");

    const backwards = await app.inject({
      method: "PATCH",
      url: "/api/business/tickets/t_edit_1",
      headers: as(sales),
      payload: { status: "processing" },
    });
    expect(backwards.statusCode).toBe(400);

    const closed = await app.inject({
      method: "PATCH",
      url: "/api/business/tickets/t_edit_1",
      headers: as(sales),
      payload: { status: "closed" },
    });
    expect(closed.statusCode).toBe(200);
    expect(
      db.select().from(auditLogs).where(and(eq(auditLogs.actorId, sales), eq(auditLogs.toolName, "update_ticket"))).all().length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("creates customers with role-appropriate defaults", async () => {
    const { app } = setup();
    const salesCreate = await app.inject({
      method: "POST",
      url: "/api/business/customers",
      headers: as(sales),
      payload: { name: "新客户甲", industry: "制造", region: "上海", paymentTerms: "月结 30 天" },
    });
    expect(salesCreate.statusCode).toBe(200);
    expect(salesCreate.json().customer).toMatchObject({ ownerId: sales, level: "C", creditLimitCents: 0 });

    const forbiddenCredit = await app.inject({
      method: "POST",
      url: "/api/business/customers",
      headers: as(sales),
      payload: { name: "新客户乙", industry: "制造", region: "上海", paymentTerms: "预付", creditLimitCents: 100_000 },
    });
    expect(forbiddenCredit.statusCode).toBe(403);

    const managerCreate = await app.inject({
      method: "POST",
      url: "/api/business/customers",
      headers: as(manager),
      payload: {
        name: "新客户丙",
        industry: "能源",
        region: "成都",
        paymentTerms: "月结 45 天",
        level: "A",
        ownerId: "u_sales_wang",
        creditLimitCents: 50_000_000,
      },
    });
    expect(managerCreate.statusCode).toBe(200);
    expect(managerCreate.json().customer).toMatchObject({
      ownerId: "u_sales_wang",
      level: "A",
      creditLimitCents: 50_000_000,
    });
  });

  it("fulfils a reserved order and deducts stock", async () => {
    const { app, db } = setup();
    const before = db
      .select()
      .from(inventory)
      .where(and(eq(inventory.warehouseId, "w_sz"), eq(inventory.productId, "p_x1")))
      .get()!;
    const { orderId } = await createConvertedOrder(app, 2);

    const fulfilled = await app.inject({
      method: "PATCH",
      url: `/api/business/orders/${orderId}`,
      headers: as(sales),
      payload: { status: "fulfilled" },
    });
    expect(fulfilled.statusCode).toBe(200);
    expect(fulfilled.json().order.status).toBe("fulfilled");

    const after = db
      .select()
      .from(inventory)
      .where(and(eq(inventory.warehouseId, "w_sz"), eq(inventory.productId, "p_x1")))
      .get()!;
    expect(after.onHand).toBe(before.onHand - 2);
    expect(after.reserved).toBe(before.reserved);
    expect(
      db.select().from(stockReservations).where(eq(stockReservations.orderId, orderId)).all().every((row) => row.status === "fulfilled"),
    ).toBe(true);

    const cancelFulfilled = await app.inject({
      method: "PATCH",
      url: `/api/business/orders/${orderId}`,
      headers: as(manager),
      payload: { status: "cancelled" },
    });
    expect(cancelFulfilled.statusCode).toBe(400);
  });

  it("cancels a reserved order and releases stock, credit and quote quantities", async () => {
    const { app, db } = setup();
    const customerBefore = db.select().from(customers).where(eq(customers.id, "c_huachen")).get()!;
    const inventoryBefore = db
      .select()
      .from(inventory)
      .where(and(eq(inventory.warehouseId, "w_sz"), eq(inventory.productId, "p_x1")))
      .get()!;
    const { quoteId, orderId } = await createConvertedOrder(app, 2);

    const salesCancel = await app.inject({
      method: "PATCH",
      url: `/api/business/orders/${orderId}`,
      headers: as(sales),
      payload: { status: "cancelled" },
    });
    expect(salesCancel.statusCode).toBe(403);

    const cancelled = await app.inject({
      method: "PATCH",
      url: `/api/business/orders/${orderId}`,
      headers: as(manager),
      payload: { status: "cancelled", reason: "客户调整采购计划" },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().order.status).toBe("cancelled");

    const customerAfter = db.select().from(customers).where(eq(customers.id, "c_huachen")).get()!;
    expect(customerAfter.creditUsedCents).toBe(customerBefore.creditUsedCents);
    const inventoryAfter = db
      .select()
      .from(inventory)
      .where(and(eq(inventory.warehouseId, "w_sz"), eq(inventory.productId, "p_x1")))
      .get()!;
    expect(inventoryAfter.reserved).toBe(inventoryBefore.reserved);
    expect(inventoryAfter.onHand).toBe(inventoryBefore.onHand);

    const quoteDetail = await app.inject({ method: "GET", url: `/api/business/quotes/${quoteId}`, headers: as(sales) });
    expect(quoteDetail.json().quote.status).toBe("approved");
    expect(quoteDetail.json().lines[0].convertedQuantity).toBe(0);
    const lineIds = db.select().from(orderLines).where(eq(orderLines.orderId, orderId)).all().map((line) => line.quoteLineId);
    expect(lineIds.every(Boolean)).toBe(true);
    expect(
      db.select().from(stockReservations).where(eq(stockReservations.orderId, orderId)).all().every((row) => row.status === "released"),
    ).toBe(true);
    expect(
      db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId)).all().every((line) => line.convertedQuantity === 0),
    ).toBe(true);
  });

  it("lets owners rename opportunities and rejects other sales", async () => {
    const { app } = setup();
    const renamed = await app.inject({
      method: "PATCH",
      url: "/api/business/opportunities/o_huachen_server",
      headers: as(sales),
      payload: { name: "服务器二期采购" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().opportunity.name).toBe("服务器二期采购");

    const forbidden = await app.inject({
      method: "PATCH",
      url: "/api/business/opportunities/o_huachen_server",
      headers: as("u_sales_wang"),
      payload: { name: "越权改名" },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
