import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { allTools, executeTool } from "./index.js";
import { approvals, customers, opportunities, orders, priceRules, quoteLines, quotes } from "../db/schema.js";
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
    expect(db.select().from(orders).all()).toHaveLength(4);
  });

  it("writes an order-conversion rejection back to the opportunity", async () => {
    const { ctx, events, db } = setup();
    const payload = {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      opportunityId: "o_huachen_server",
      lines: [{ sku: "X1", quantity: 120 }],
    };
    const preview = await executeTool(tool("create_quote"), ctx, { ...payload, dryRun: true });
    expect(preview.model.ok).toBe(true);
    const token = events.find((event) => event.type === "artifact").payload.confirmationToken;
    const quoteResult = await executeTool(tool("create_quote"), ctx, {
      ...payload,
      dryRun: false,
      confirmationToken: token,
      idempotencyKey: "idem-reject-quote-1",
    });
    expect(quoteResult.model.ok).toBe(true);
    const quote = (quoteResult.model as any).data.quote;

    const orderPreview = await executeTool(tool("convert_quote_to_order"), ctx, { quoteId: quote.id, dryRun: true });
    expect(orderPreview.model.ok).toBe(true);
    const orderToken = events.filter((event) => event.type === "artifact").at(-1).payload.confirmationToken;
    const pending = await executeTool(tool("convert_quote_to_order"), ctx, {
      quoteId: quote.id,
      dryRun: false,
      confirmationToken: orderToken,
      idempotencyKey: "idem-reject-order-1",
    });
    expect((pending.model as any).data.status).toBe("pending_approval");
    const approvalId = (pending.model as any).data.approvalId;

    decideApproval({ ...ctx, actor: manager }, approvalId, "reject", "信用不足", "idem-reject-approval-1");
    const opportunity = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
    expect(opportunity?.nextAction).toContain("驳回");
    expect(opportunity?.riskLevel).toBe("high");
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

  it("converts part of a quote and leaves the rest convertible", async () => {
    const { ctx, events, db } = setup();
    const base = {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      opportunityId: "o_huachen_server",
      lines: [{ sku: "X1", quantity: 5 }],
    };
    const preview = await executeTool(tool("create_quote"), ctx, { ...base, dryRun: true });
    expect(preview.model.ok).toBe(true);
    const quoteToken = events.find((event) => event.type === "artifact").payload.confirmationToken;
    const committed = await executeTool(tool("create_quote"), ctx, {
      ...base,
      dryRun: false,
      confirmationToken: quoteToken,
      idempotencyKey: "idem-split-quote",
    });
    expect(committed.model.ok).toBe(true);
    const quoteId = (committed.model as any).data.quote.id as string;
    const quote = db.select().from(quotes).where(eq(quotes.id, quoteId)).get()!;
    const line = db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId)).get()!;

    const partialPreview = await executeTool(tool("convert_quote_to_order"), ctx, {
      quoteId,
      lines: [{ quoteLineId: line.id, quantity: 2 }],
      dryRun: true,
    });
    expect(partialPreview.model.ok).toBe(true);
    const partialPlan = (partialPreview.model as any).data.preview;
    expect(partialPlan.totalCents).toBeLessThan(quote.totalCents);
    expect(partialPlan.fullyConvertedAfter).toBe(false);
    expect(partialPlan.lines[0]).toMatchObject({ remainingQuantity: 5, convertingQuantity: 2, remainingAfter: 3 });

    const partialToken = events.filter((event) => event.type === "artifact").at(-1)!.payload.confirmationToken;
    const partial = await executeTool(tool("convert_quote_to_order"), ctx, {
      quoteId,
      lines: [{ quoteLineId: line.id, quantity: 2 }],
      dryRun: false,
      confirmationToken: partialToken,
      idempotencyKey: "idem-split-order-1",
    });
    expect((partial.model as any).data.status).toBe("committed");
    expect((partial.model as any).data.order.fullyConverted).toBe(false);
    expect((partial.model as any).data.order.remainingQuantity).toBe(3);
    expect(db.select().from(quoteLines).where(eq(quoteLines.id, line.id)).get()!.convertedQuantity).toBe(2);
    expect(db.select().from(quotes).where(eq(quotes.id, quoteId)).get()!.status).toBe("approved");
    const partialOpportunity = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get()!;
    expect(partialOpportunity.stage).toBe("negotiation");
    expect(partialOpportunity.nextAction).toContain("剩余 3 件");

    const remainderPreview = await executeTool(tool("convert_quote_to_order"), ctx, { quoteId, dryRun: true });
    expect((remainderPreview.model as any).data.preview.lines[0]).toMatchObject({ convertingQuantity: 3, remainingAfter: 0 });
    const remainderToken = events.filter((event) => event.type === "artifact").at(-1)!.payload.confirmationToken;
    const remainder = await executeTool(tool("convert_quote_to_order"), ctx, {
      quoteId,
      dryRun: false,
      confirmationToken: remainderToken,
      idempotencyKey: "idem-split-order-2",
    });
    expect((remainder.model as any).data.order.fullyConverted).toBe(true);
    expect(db.select().from(quoteLines).where(eq(quoteLines.id, line.id)).get()!.convertedQuantity).toBe(5);
    expect(db.select().from(quotes).where(eq(quotes.id, quoteId)).get()!.status).toBe("converted");
    expect(db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get()!.stage).toBe("won");

    const ordersForQuote = db.select().from(orders).where(eq(orders.quoteId, quoteId)).all();
    expect(ordersForQuote).toHaveLength(2);
    expect(ordersForQuote.reduce((sum, order) => sum + order.totalCents, 0)).toBe(quote.totalCents);
  });

  it("creates a partial order after manager approval when the selected amount exceeds credit", async () => {
    const { ctx, events, db } = setup();
    const preview = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: true,
    });
    const quoteToken = events.find((event) => event.type === "artifact").payload.confirmationToken;
    const committed = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: false,
      confirmationToken: quoteToken,
      idempotencyKey: "idem-split-approval-quote",
    });
    const quoteId = (committed.model as any).data.quote.id as string;
    const quote = db.select().from(quotes).where(eq(quotes.id, quoteId)).get()!;
    const line = db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId)).get()!;

    const partialPreview = await executeTool(tool("convert_quote_to_order"), ctx, {
      quoteId,
      lines: [{ quoteLineId: line.id, quantity: 20 }],
      dryRun: true,
    });
    expect((partialPreview.model as any).data.preview.requiresApproval).toBe(true);
    const token = events.filter((event) => event.type === "artifact").at(-1)!.payload.confirmationToken;
    const pending = await executeTool(tool("convert_quote_to_order"), ctx, {
      quoteId,
      lines: [{ quoteLineId: line.id, quantity: 20 }],
      dryRun: false,
      confirmationToken: token,
      idempotencyKey: "idem-split-approval-convert",
    });
    expect((pending.model as any).data.status).toBe("pending_approval");
    const approvalId = (pending.model as any).data.approvalId as string;
    expect(db.select().from(orders).where(eq(orders.quoteId, quoteId)).all()).toHaveLength(0);

    decideApproval({ ...ctx, actor: manager }, approvalId, "approve", "同意分批", "idem-split-approval-decide");
    const ordersForQuote = db.select().from(orders).where(eq(orders.quoteId, quoteId)).all();
    expect(ordersForQuote).toHaveLength(1);
    expect(ordersForQuote[0].totalCents).toBeLessThan(quote.totalCents);
    expect(db.select().from(quoteLines).where(eq(quoteLines.id, line.id)).get()!.convertedQuantity).toBe(20);
    expect(db.select().from(quotes).where(eq(quotes.id, quoteId)).get()!.status).toBe("approved");
  });

  it("rejects a split conversion quantity above the remaining amount", async () => {
    const { ctx, events, db } = setup();
    await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 3 }],
      dryRun: true,
    });
    const quoteToken = events.find((event) => event.type === "artifact").payload.confirmationToken;
    const committed = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 3 }],
      dryRun: false,
      confirmationToken: quoteToken,
      idempotencyKey: "idem-split-invalid-quote",
    });
    const quoteId = (committed.model as any).data.quote.id as string;
    const line = db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId)).get()!;
    const result = await executeTool(tool("convert_quote_to_order"), ctx, {
      quoteId,
      lines: [{ quoteLineId: line.id, quantity: 4 }],
      dryRun: true,
    });
    expect(result.model.ok).toBe(false);
    if (!result.model.ok) {
      expect(result.model.error.code).toBe("VALIDATION_ERROR");
      expect(result.model.error.message).toContain("剩余 3 件");
    }
  });

  it("generates briefing alerts for manager", async () => {
    const { ctx } = setup();
    const managerCtx = { ...ctx, actor: manager };
    const result = await executeTool(tool("get_sales_briefing"), managerCtx, { scope: "team" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) expect((result.model.data as any).alerts.length).toBeGreaterThan(0);
  });

  it("links a created quote and order to an opportunity", async () => {
    const { ctx, events, db } = setup();
    const preview = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      opportunityId: "o_huachen_server",
      lines: [{ sku: "SRV", quantity: 2 }],
      dryRun: true,
    });
    expect(preview.model.ok).toBe(true);
    const token = events.find((event) => event.type === "artifact").payload.confirmationToken;
    const committed = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      opportunityId: "o_huachen_server",
      lines: [{ sku: "SRV", quantity: 2 }],
      dryRun: false,
      confirmationToken: token,
      idempotencyKey: "idem-opportunity-quote",
    });
    expect(committed.model.ok).toBe(true);
    const quote = db.select().from(quotes).where(eq(quotes.id, (committed.model as any).data.quote.id)).get();
    expect(quote?.opportunityId).toBe("o_huachen_server");

    const orderPreview = await executeTool(tool("convert_quote_to_order"), ctx, { quoteId: quote!.id, dryRun: true });
    expect(orderPreview.model.ok).toBe(true);
    const orderToken = events.filter((event) => event.type === "artifact").at(-1).payload.confirmationToken;
    const orderCommitted = await executeTool(tool("convert_quote_to_order"), ctx, {
      quoteId: quote!.id,
      dryRun: false,
      confirmationToken: orderToken,
      idempotencyKey: "idem-opportunity-order",
    });
    expect(orderCommitted.model.ok).toBe(true);
    const order = db.select().from(orders).where(eq(orders.quoteId, quote!.id)).get();
    expect(order?.opportunityId).toBe("o_huachen_server");
    const opportunity = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
    expect(opportunity?.stage).toBe("won");
  });
});
