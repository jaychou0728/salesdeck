import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { allTools, executeTool } from "./index.js";
import { approvals, customers, orders, priceRules } from "../db/schema.js";
import { decideApproval } from "../domain/approvals.js";
import type { Actor } from "@salespilot/shared";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };
const manager: Actor = { id: "u_manager_wang", name: "老王", role: "manager", teamId: "team_east" };

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  const events: any[] = [];
  return { db, sqlite, events, ctx: { db, sqlite, actor: sales, traceId: "t_write", emit: (e: any) => events.push(e) } };
}

const tool = (name: string) => allTools.find((item) => item.name === name)!;

describe("write tools", () => {
  it("issues a quote preview without leaking the token to the model", async () => {
    const { ctx, events } = setup();
    const result = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: true,
    });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) expect(JSON.stringify(result.model)).not.toContain("confirmationToken");
    const artifact = events.find((event) => event.type === "artifact");
    expect(artifact.payload.confirmationToken).toBeTruthy();
    expect(artifact.payload.kind).toBe("quote");
  });

  it("creates an approval when a quote is below the price floor", async () => {
    const { ctx, events, db } = setup();
    db.update(priceRules).set({ discountBps: 9000 }).where(eq(priceRules.id, "pr_x1_a_promo")).run();
    const preview = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: true,
    });
    expect(preview.model.ok).toBe(true);
    const token = events.find((event) => event.type === "artifact").payload.confirmationToken;
    const result = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: false,
      confirmationToken: token,
      idempotencyKey: "idem-floor-1",
    });
    expect(result.model.ok).toBe(true);
    expect((result.model as any).data.quote.status).toBe("pending_approval");
    expect((result.model as any).data.approvalId).toBeTruthy();
    expect(db.select().from(approvals).all()[0].type).toBe("quote_price");
  });

  it("converts a quote into an approval when credit is insufficient", async () => {
    const { ctx, events, db } = setup();
    const preview = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: true,
    });
    expect(preview.model.ok).toBe(true);
    const token = events.find((event) => event.type === "artifact").payload.confirmationToken;
    const quoteResult = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: false,
      confirmationToken: token,
      idempotencyKey: "idem-quote-1",
    });
    expect(quoteResult.model.ok).toBe(true);
    const quote = (quoteResult.model as any).data.quote;
    const orderPreview = await executeTool(tool("convert_quote_to_order"), ctx, { quoteId: quote.id, dryRun: true });
    expect(orderPreview.model.ok).toBe(true);
    const orderToken = events.filter((event) => event.type === "artifact").at(-1).payload.confirmationToken;
    const orderResult = await executeTool(tool("convert_quote_to_order"), ctx, {
      quoteId: quote.id,
      dryRun: false,
      confirmationToken: orderToken,
      idempotencyKey: "idem-order-1",
    });
    expect(orderResult.model.ok).toBe(true);
    expect((orderResult.model as any).data.status).toBe("pending_approval");
    expect(db.select().from(approvals).all()).toHaveLength(1);
    expect(db.select().from(orders).all()).toHaveLength(1);
  });

  it("approves and creates the order with reserved stock", async () => {
    const { ctx, events, db } = setup();
    const preview = await executeTool(tool("create_quote"), ctx, { customerId: "c_huachen", contactId: "ct_zhang_1", lines: [{ sku: "X1", quantity: 120 }], dryRun: true });
    const token = events.find((event) => event.type === "artifact").payload.confirmationToken;
    const quoteResult = await executeTool(tool("create_quote"), ctx, { customerId: "c_huachen", contactId: "ct_zhang_1", lines: [{ sku: "X1", quantity: 120 }], dryRun: false, confirmationToken: token, idempotencyKey: "idem-quote-2" });
    const quote = (quoteResult.model as any).data.quote;
    const orderPreview = await executeTool(tool("convert_quote_to_order"), ctx, { quoteId: quote.id, dryRun: true });
    const orderToken = events.filter((event) => event.type === "artifact").at(-1).payload.confirmationToken;
    const pending = await executeTool(tool("convert_quote_to_order"), ctx, { quoteId: quote.id, dryRun: false, confirmationToken: orderToken, idempotencyKey: "idem-order-2" });
    const approvalId = (pending.model as any).data.approvalId;
    const managerCtx = { ...ctx, actor: manager };
    decideApproval(managerCtx, approvalId, "approve", "同意，注意回款", "idem-approve-1");
    const order = db.select().from(orders).where(eq(orders.quoteId, quote.id)).get();
    expect(order?.status).toBe("reserved");
    const customer = db.select().from(customers).where(eq(customers.id, "c_huachen")).get();
    expect(customer!.creditUsedCents).toBeGreaterThan(4_600_000);
  });

  it("generates briefing alerts for manager", async () => {
    const { ctx } = setup();
    const managerCtx = { ...ctx, actor: manager };
    const result = await executeTool(tool("get_sales_briefing"), managerCtx, { scope: "team" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) expect((result.model.data as any).alerts.length).toBeGreaterThan(0);
  });
});
