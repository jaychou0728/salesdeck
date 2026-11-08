import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { buildApp } from "../app.js";
import { MockProvider } from "../agent/mockProvider.js";
import { auditLogs, contacts, customers, inventory, quotes, users } from "../db/schema.js";

type App = ReturnType<typeof buildApp>;

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  db.insert(users)
    .values({ id: "u_sales_zhou", name: "小周", role: "sales", teamId: "team_east" })
    .run();
  db.insert(customers)
    .values({
      id: "c_other",
      name: "外组客户",
      industry: "制造",
      level: "B",
      ownerId: "u_sales_zhou",
      region: "上海",
      creditLimitCents: 1_000_000,
      creditUsedCents: 0,
      paymentTerms: "预付",
      status: "active",
    })
    .run();
  db.insert(contacts)
    .values({ id: "ct_other", customerId: "c_other", name: "钱总", title: "采购", phone: "130****9001", email: "qian@other.example", isPrimary: true })
    .run();
  db.insert(quotes)
    .values({
      id: "q_other",
      quoteNo: "Q-2026-9001",
      customerId: "c_other",
      contactId: "ct_other",
      ownerId: "u_sales_zhou",
      status: "approved",
      subtotalCents: 100,
      discountTotalCents: 0,
      taxTotalCents: 0,
      totalCents: 100,
      validUntil: Date.now() + 86400_000,
      riskFlags: "[]",
      notes: null,
      createdAt: Date.now(),
    })
    .run();
  const app = buildApp({ db, sqlite, provider: new MockProvider() });
  return { app, db, sqlite };
}

const as = (id: string) => ({ "x-actor-id": id });

async function createQuoteViaApi(app: App, quantity = 2): Promise<string> {
  const preview = await app.inject({
    method: "POST",
    url: "/api/business/quotes/preview",
    headers: as("u_sales_lin"),
    payload: { customerId: "c_huachen", contactId: "ct_zhang_1", lines: [{ sku: "X1", quantity }] },
  });
  expect(preview.statusCode).toBe(200);
  const previewBody = preview.json();
  expect(previewBody.ok).toBe(true);
  expect(previewBody.confirmationToken).toBeTruthy();
  const commit = await app.inject({
    method: "POST",
    url: "/api/business/quotes/commit",
    headers: as("u_sales_lin"),
    payload: { token: previewBody.confirmationToken, payload: previewBody.input, idempotencyKey: `idem_${randomUUID()}` },
  });
  expect(commit.statusCode).toBe(200);
  const commitBody = commit.json();
  expect(commitBody.ok).toBe(true);
  return commitBody.data.quote.id;
}

describe("business workspace", () => {
  it("returns actor profile and role permissions from /me", async () => {
    const { app } = setup();

    const sales = await app.inject({ method: "GET", url: "/api/business/me", headers: as("u_sales_lin") });
    expect(sales.statusCode).toBe(200);
    expect(sales.json()).toMatchObject({
      ok: true,
      actor: { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" },
      permissions: { scope: "self", canApprove: false, canAdjustInventory: false },
    });

    const manager = await app.inject({ method: "GET", url: "/api/business/me", headers: as("u_manager_wang") });
    expect(manager.json()).toMatchObject({
      ok: true,
      actor: { id: "u_manager_wang", role: "manager" },
      permissions: { scope: "team", canApprove: true, canAdjustInventory: true },
    });

    const fallback = await app.inject({ method: "GET", url: "/api/business/me" });
    expect(fallback.statusCode).toBe(200);
    expect(fallback.json().actor.id).toBe("u_sales_lin");
  });

  it("scopes customers and quotes by role and rejects unknown actors", async () => {
    const { app } = setup();

    const salesCustomers = await app.inject({ method: "GET", url: "/api/business/customers", headers: as("u_sales_lin") });
    expect(salesCustomers.statusCode).toBe(200);
    const salesRows = salesCustomers.json().customers as Array<{ id: string; ownerId: string; ownerName?: string; creditUtilization?: number }>;
    expect(salesRows.length).toBeGreaterThan(0);
    expect(salesRows.every((row) => row.ownerId === "u_sales_lin")).toBe(true);
    expect(salesRows.some((row) => row.id === "c_other")).toBe(false);
    expect(salesRows[0].ownerName).toBeTruthy();
    expect(typeof salesRows[0].creditUtilization).toBe("number");

    const managerCustomers = await app.inject({ method: "GET", url: "/api/business/customers", headers: as("u_manager_wang") });
    expect(managerCustomers.json().customers.some((row: { id: string }) => row.id === "c_other")).toBe(true);

    const salesQuoteDetail = await app.inject({ method: "GET", url: "/api/business/quotes/q_other", headers: as("u_sales_lin") });
    expect(salesQuoteDetail.statusCode).toBe(403);

    const managerQuoteDetail = await app.inject({ method: "GET", url: "/api/business/quotes/q_other", headers: as("u_manager_wang") });
    expect(managerQuoteDetail.statusCode).toBe(200);

    const salesCustomerDetail = await app.inject({ method: "GET", url: "/api/business/customers/c_other", headers: as("u_sales_lin") });
    expect(salesCustomerDetail.statusCode).toBe(403);

    const managerCustomerDetail = await app.inject({ method: "GET", url: "/api/business/customers/c_other", headers: as("u_manager_wang") });
    expect(managerCustomerDetail.statusCode).toBe(200);
    expect(managerCustomerDetail.json().customer.id).toBe("c_other");

    const unknown = await app.inject({ method: "GET", url: "/api/business/customers", headers: as("u_ghost") });
    expect(unknown.statusCode).toBe(403);
  });

  it("supports customer search by name or region", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/api/business/customers?q=华辰", headers: as("u_sales_lin") });
    expect(response.statusCode).toBe(200);
    expect(response.json().customers.map((row: { id: string }) => row.id)).toEqual(["c_huachen"]);
  });

  it("adjusts inventory as manager with audit and blocks sales", async () => {
    const { app, db } = setup();

    const salesAttempt = await app.inject({
      method: "POST",
      url: "/api/business/inventory/adjust",
      headers: as("u_sales_lin"),
      payload: { warehouseId: "w_sz", productId: "p_x1", delta: 10, reason: "盘点" },
    });
    expect(salesAttempt.statusCode).toBe(403);

    const overReserved = await app.inject({
      method: "POST",
      url: "/api/business/inventory/adjust",
      headers: as("u_manager_wang"),
      payload: { warehouseId: "w_sz", productId: "p_x1", delta: -141, reason: "盘亏" },
    });
    expect(overReserved.statusCode).toBe(400);

    const zeroDelta = await app.inject({
      method: "POST",
      url: "/api/business/inventory/adjust",
      headers: as("u_manager_wang"),
      payload: { warehouseId: "w_sz", productId: "p_x1", delta: 0, reason: "错误操作" },
    });
    expect(zeroDelta.statusCode).toBe(400);

    const ok = await app.inject({
      method: "POST",
      url: "/api/business/inventory/adjust",
      headers: as("u_manager_wang"),
      payload: { warehouseId: "w_sz", productId: "p_x1", delta: 10, reason: "补货入库" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ ok: true, row: { onHand: 160, available: 140 } });
    expect(ok.json().row).not.toHaveProperty("costCents");

    const row = db.select().from(inventory).where(eq(inventory.warehouseId, "w_sz")).all().find((item) => item.productId === "p_x1");
    expect(row?.onHand).toBe(160);

    const audit = db.select().from(auditLogs).all().filter((entry) => entry.toolName === "inventory_adjust");
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0].status).toBe("ok");
    expect(audit[0].actorId).toBe("u_manager_wang");
  });

  it("transfers stock between warehouses as manager and blocks sales", async () => {
    const { app, db } = setup();

    const salesAttempt = await app.inject({
      method: "POST",
      url: "/api/business/inventory/transfer",
      headers: as("u_sales_lin"),
      payload: { fromWarehouseId: "w_sz", toWarehouseId: "w_sh", productId: "p_x1", quantity: 10 },
    });
    expect(salesAttempt.statusCode).toBe(403);

    const sameWarehouse = await app.inject({
      method: "POST",
      url: "/api/business/inventory/transfer",
      headers: as("u_manager_wang"),
      payload: { fromWarehouseId: "w_sz", toWarehouseId: "w_sz", productId: "p_x1", quantity: 10 },
    });
    expect(sameWarehouse.statusCode).toBe(400);

    const response = await app.inject({
      method: "POST",
      url: "/api/business/inventory/transfer",
      headers: as("u_manager_wang"),
      payload: { fromWarehouseId: "w_sz", toWarehouseId: "w_sh", productId: "p_x1", quantity: 10 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, from: { onHand: 140 }, to: { onHand: 10 } });

    const source = db.select().from(inventory).all().find((item) => item.warehouseId === "w_sz" && item.productId === "p_x1");
    const target = db.select().from(inventory).all().find((item) => item.warehouseId === "w_sh" && item.productId === "p_x1");
    expect(source?.onHand).toBe(140);
    expect(target?.onHand).toBe(10);

    const audit = db.select().from(auditLogs).all().filter((entry) => entry.toolName === "inventory_transfer");
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0].status).toBe("ok");
  });

  it("previews and commits a manual quote, then reads it back", async () => {
    const { app } = setup();

    const preview = await app.inject({
      method: "POST",
      url: "/api/business/quotes/preview",
      headers: as("u_sales_lin"),
      payload: { customerId: "c_huachen", contactId: "ct_zhang_1", lines: [{ sku: "X1", quantity: 2 }] },
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json();
    expect(previewBody.ok).toBe(true);
    expect(previewBody.preview.totals.totalCents).toBeGreaterThan(0);
    expect(previewBody.input.customerId).toBe("c_huachen");
    expect(typeof previewBody.confirmationToken).toBe("string");

    const commit = await app.inject({
      method: "POST",
      url: "/api/business/quotes/commit",
      headers: as("u_sales_lin"),
      payload: { token: previewBody.confirmationToken, payload: previewBody.input, idempotencyKey: "idem-manual-quote-001" },
    });
    expect(commit.statusCode).toBe(200);
    const commitBody = commit.json();
    expect(commitBody.ok).toBe(true);
    const quoteId = commitBody.data.quote.id as string;

    const detail = await app.inject({ method: "GET", url: `/api/business/quotes/${quoteId}`, headers: as("u_sales_lin") });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json();
    expect(detailBody.quote.id).toBe(quoteId);
    expect(detailBody.quote.ownerName).toBe("小林");
    expect(detailBody.customer.name).toBe("华辰设计");
    expect(detailBody.contact.name).toBe("张总");
    expect(detailBody.lines).toHaveLength(1);
    expect(detailBody.approval).toBeNull();

    const list = await app.inject({ method: "GET", url: "/api/business/quotes", headers: as("u_sales_lin") });
    expect(list.statusCode).toBe(200);
    const listed = list.json().quotes.find((row: { id: string }) => row.id === quoteId);
    expect(listed).toBeTruthy();
    expect(listed.customerName).toBe("华辰设计");
    expect(listed.ownerName).toBe("小林");
  });

  it("rejects an invalid manual quote preview with the tool error", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/business/quotes/preview",
      headers: as("u_sales_lin"),
      payload: { customerId: "c_huachen", contactId: "ct_zhang_1", lines: [{ sku: "NOPE", quantity: 1 }] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("converts a 120 unit quote into a credit approval and creates the order after manager decision", async () => {
    const { app } = setup();
    const quoteId = await createQuoteViaApi(app, 120);

    const convertPreview = await app.inject({
      method: "POST",
      url: `/api/business/quotes/${quoteId}/convert-preview`,
      headers: as("u_sales_lin"),
    });
    expect(convertPreview.statusCode).toBe(200);
    const previewBody = convertPreview.json();
    expect(previewBody.ok).toBe(true);
    expect(previewBody.preview.requiresApproval).toBe(true);
    expect(previewBody.confirmationToken).toBeTruthy();

    const convert = await app.inject({
      method: "POST",
      url: `/api/business/quotes/${quoteId}/convert`,
      headers: as("u_sales_lin"),
      payload: { token: previewBody.confirmationToken, payload: previewBody.input, idempotencyKey: "idem-convert-001" },
    });
    expect(convert.statusCode).toBe(200);
    const convertBody = convert.json();
    expect(convertBody.ok).toBe(true);
    expect(convertBody.data.status).toBe("pending_approval");
    const approvalId = convertBody.data.approvalId as string;
    expect(approvalId).toBeTruthy();

    const quoteDetail = await app.inject({ method: "GET", url: `/api/business/quotes/${quoteId}`, headers: as("u_sales_lin") });
    const quoteTotal = quoteDetail.json().quote.totalCents as number;

    const approvals = await app.inject({ method: "GET", url: "/api/business/approvals", headers: as("u_manager_wang") });
    expect(approvals.statusCode).toBe(200);
    const listed = approvals.json().approvals.find((row: { id: string }) => row.id === approvalId);
    expect(listed).toBeTruthy();
    expect(listed.status).toBe("pending");
    expect(listed.amountCents).toBe(quoteTotal);
    expect(listed.customerName).toBe("华辰设计");
    expect(listed.requesterName).toBe("小林");

    const approvalDetail = await app.inject({ method: "GET", url: `/api/business/approvals/${approvalId}`, headers: as("u_manager_wang") });
    expect(approvalDetail.statusCode).toBe(200);
    expect(approvalDetail.json().approval.id).toBe(approvalId);

    const decision = await app.inject({
      method: "POST",
      url: `/api/approvals/${approvalId}/decide`,
      headers: as("u_manager_wang"),
      payload: { decision: "approve", comment: "同意", idempotencyKey: "idem-approve-business-1" },
    });
    expect(decision.statusCode).toBe(200);

    const converted = await app.inject({ method: "GET", url: `/api/business/quotes/${quoteId}`, headers: as("u_sales_lin") });
    expect(converted.json().quote.status).toBe("converted");

    const orders = await app.inject({ method: "GET", url: "/api/business/orders", headers: as("u_sales_lin") });
    expect(orders.statusCode).toBe(200);
    const order = orders.json().orders.find((row: { quoteId: string }) => row.quoteId === quoteId);
    expect(order).toBeTruthy();
    expect(order.status).toBe("reserved");

    const orderDetail = await app.inject({ method: "GET", url: `/api/business/orders/${order.id}`, headers: as("u_sales_lin") });
    expect(orderDetail.statusCode).toBe(200);
    expect(orderDetail.json().order.ownerName).toBe("小林");
    expect(orderDetail.json().lines.length).toBeGreaterThan(0);
    expect(orderDetail.json().reservations.length).toBeGreaterThan(0);
  });

  it("returns scoped dashboard metrics and alerts", async () => {
    const { app } = setup();

    const sales = await app.inject({ method: "GET", url: "/api/business/dashboard", headers: as("u_sales_lin") });
    expect(sales.statusCode).toBe(200);
    const salesBody = sales.json();
    expect(salesBody.ok).toBe(true);
    for (const key of ["customers", "openQuotes", "pendingApprovals", "lowStock", "openTickets"]) {
      expect(typeof salesBody.metrics[key]).toBe("number");
    }
    expect(salesBody.metrics.customers).toBe(9);
    expect(salesBody.metrics.lowStock).toBeGreaterThan(0);
    expect(salesBody.alerts.length).toBeGreaterThan(0);
    expect(salesBody.recentQuotes.length).toBeGreaterThan(0);
    expect(salesBody.recentOrders.length).toBeGreaterThan(0);

    const manager = await app.inject({ method: "GET", url: "/api/business/dashboard", headers: as("u_manager_wang") });
    expect(manager.statusCode).toBe(200);
    expect(manager.json().metrics.customers).toBeGreaterThan(salesBody.metrics.customers);
  });

  it("lists scoped traces and audit entries after manual and chat operations", async () => {
    const { app } = setup();

    await createQuoteViaApi(app, 1);

    const audit = await app.inject({ method: "GET", url: "/api/business/audit", headers: as("u_sales_lin") });
    expect(audit.statusCode).toBe(200);
    const auditRows = audit.json().audit as Array<{ toolName: string; actorName: string; args: unknown; result: unknown; status: string }>;
    const quoteAudit = auditRows.find((row) => row.toolName === "create_quote");
    expect(quoteAudit).toBeTruthy();
    expect(quoteAudit!.actorName).toBe("小林");
    expect(quoteAudit!.status).toBe("ok");
    expect(quoteAudit!.args).toBeTruthy();
    expect(quoteAudit!.result).toBeTruthy();

    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: as("u_sales_lin"),
      payload: { message: "生成晨报" },
    });
    expect(chat.statusCode).toBe(200);

    const traces = await app.inject({ method: "GET", url: "/api/business/traces", headers: as("u_sales_lin") });
    expect(traces.statusCode).toBe(200);
    const traceRows = traces.json().traces as Array<{ id: string; actorId: string }>;
    expect(traceRows.length).toBeGreaterThan(0);
    expect(traceRows.every((row) => row.actorId === "u_sales_lin")).toBe(true);

    const traceDetail = await app.inject({ method: "GET", url: `/api/business/traces/${traceRows[0].id}`, headers: as("u_sales_lin") });
    expect(traceDetail.statusCode).toBe(200);
    expect(traceDetail.json().trace.id).toBe(traceRows[0].id);
    expect(traceDetail.json().events.length).toBeGreaterThan(0);

    const managerTraces = await app.inject({ method: "GET", url: "/api/business/traces", headers: as("u_manager_wang") });
    expect(managerTraces.json().traces.some((row: { id: string }) => row.id === traceRows[0].id)).toBe(true);
  });

  it("keeps the quote approved while showing an order-conversion rejection", async () => {
    const { app } = setup();
    const quoteId = await createQuoteViaApi(app, 120);
    const preview = await app.inject({
      method: "POST",
      url: `/api/business/quotes/${quoteId}/convert-preview`,
      headers: as("u_sales_lin"),
    });
    const previewBody = preview.json();
    const convert = await app.inject({
      method: "POST",
      url: `/api/business/quotes/${quoteId}/convert`,
      headers: as("u_sales_lin"),
      payload: { token: previewBody.confirmationToken, payload: previewBody.input, idempotencyKey: "idem-reject-list-1" },
    });
    const approvalId = convert.json().data.approvalId as string;
    await app.inject({
      method: "POST",
      url: `/api/approvals/${approvalId}/decide`,
      headers: as("u_manager_wang"),
      payload: { decision: "reject", comment: "信用不足", idempotencyKey: "idem-reject-list-2" },
    });

    const list = await app.inject({ method: "GET", url: "/api/business/quotes", headers: as("u_sales_lin") });
    const row = list.json().quotes.find((quote: { id: string }) => quote.id === quoteId);
    expect(row.status).toBe("approved");
    expect(row.approvalStatus).toBe("rejected");
    expect(row.approvalType).toBe("order_conversion");
  });

  it("creates and approves a credit limit request", async () => {
    const { app } = setup();
    const request = await app.inject({
      method: "POST",
      url: "/api/business/customers/c_huachen/credit-limit-requests",
      headers: as("u_sales_lin"),
      payload: { requestedLimitCents: 210_000_000, reason: "需要提升额度完成订单" },
    });
    expect(request.statusCode).toBe(200);
    const approvalId = request.json().approvalId as string;

    const approve = await app.inject({
      method: "POST",
      url: `/api/approvals/${approvalId}/decide`,
      headers: as("u_manager_wang"),
      payload: { decision: "approve", idempotencyKey: "idem-credit-limit-1" },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().data.creditLimitCents).toBe(210_000_000);

    const customer = await app.inject({ method: "GET", url: "/api/business/customers/c_huachen", headers: as("u_sales_lin") });
    expect(customer.json().customer.creditLimitCents).toBe(210_000_000);

    const quoteId = await createQuoteViaApi(app, 120);
    const preview = await app.inject({
      method: "POST",
      url: `/api/business/quotes/${quoteId}/convert-preview`,
      headers: as("u_sales_lin"),
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json();
    expect(previewBody.preview.requiresApproval).toBe(false);
    const convert = await app.inject({
      method: "POST",
      url: `/api/business/quotes/${quoteId}/convert`,
      headers: as("u_sales_lin"),
      payload: { token: previewBody.confirmationToken, payload: previewBody.input, idempotencyKey: "idem-credit-convert-1" },
    });
    expect(convert.statusCode).toBe(200);
    expect(convert.json().data.status).toBe("committed");

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/business/customers/c_zhihang/credit-limit-requests",
      headers: as("u_sales_lin"),
      payload: { requestedLimitCents: 500_000_000, reason: "越权" },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("returns opportunities, follow-ups and assessment in customer detail", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/api/business/customers/c_huachen", headers: as("u_sales_lin") });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.opportunities.some((row: { id: string }) => row.id === "o_huachen_server")).toBe(true);
    expect(body.followUps.length).toBeGreaterThan(0);
    expect(body.assessment.suggestion).toBeTruthy();
  });
});
