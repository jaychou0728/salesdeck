import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { AppError, type Actor, type ErrorCode } from "@salespilot/shared";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { allTools, executeTool } from "./index.js";
import { afterSalesTickets, inventory, knowledgeChunks, knowledgeDocs, priceRules, quotes } from "../db/schema.js";
import { decideApproval } from "../domain/approvals.js";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };
const manager: Actor = { id: "u_manager_wang", name: "老王", role: "manager", teamId: "team_east" };

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  const events: any[] = [];
  return { db, sqlite, events, ctx: { db, sqlite, actor: sales, traceId: "t_edge", emit: (e: any) => events.push(e) } };
}

const tool = (name: string) => allTools.find((item) => item.name === name)!;

async function commitQuote(ctx: any, idempotencyKey: string) {
  const input = {
    customerId: "c_huachen",
    contactId: "ct_zhang_1",
    lines: [{ sku: "X1", quantity: 120 }],
  };
  const preview = await executeTool(tool("create_quote"), ctx, { ...input, dryRun: true });
  expect(preview.model.ok).toBe(true);
  const token = preview.artifacts!.find((artifact) => artifact.kind === "quote")!.confirmationToken!;
  const result = await executeTool(tool("create_quote"), ctx, {
    ...input,
    dryRun: false,
    confirmationToken: token,
    idempotencyKey,
  });
  return { preview, token, result };
}

function expectAppError(fn: () => unknown, code: ErrorCode) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected AppError ${code} but nothing was thrown`);
}

describe("write tool edge cases", () => {
  it("blocks convert dry-run when stock is insufficient", async () => {
    const { ctx, db, events } = setup();
    const { result } = await commitQuote(ctx, "idem-stock-quote");
    expect(result.model.ok).toBe(true);
    const quote = (result.model as any).data.quote;

    db.update(inventory).set({ onHand: 0, reserved: 0 }).where(eq(inventory.productId, "p_x1")).run();
    events.length = 0;

    const converted = await executeTool(tool("convert_quote_to_order"), ctx, { quoteId: quote.id, dryRun: true });
    expect(converted.model.ok).toBe(false);
    if (!converted.model.ok) expect(converted.model.error.code).toBe("OUT_OF_STOCK");
    expect(events.filter((event) => event.type === "artifact" && event.payload.title === "转订单预览")).toHaveLength(0);
  });

  it("marks the quote rejected when a quote_price approval is rejected", async () => {
    const { ctx, db } = setup();
    db.update(priceRules).set({ discountBps: 9000 }).where(eq(priceRules.id, "pr_x1_a_promo")).run();
    const { result } = await commitQuote(ctx, "idem-reject-quote");
    const approvalId = (result.model as any).data.approvalId;
    expect(approvalId).toBeTruthy();

    const managerCtx = { ...ctx, actor: manager };
    const outcome = decideApproval(managerCtx, approvalId, "reject", "no", "idem-reject-1");
    expect((outcome as any).status).toBe("rejected");

    const quote = db.select().from(quotes).where(eq(quotes.id, (result.model as any).data.quote.id)).get();
    expect(quote?.status).toBe("rejected");
  });

  it("returns NOT_FOUND for an unknown SKU", async () => {
    const { ctx } = setup();
    const result = await executeTool(tool("create_quote"), ctx, {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "NOPE", quantity: 1 }],
      dryRun: true,
    });
    expect(result.model.ok).toBe(false);
    if (!result.model.ok) expect(result.model.error.code).toBe("NOT_FOUND");
  });

  it("replays the same quote for a repeated idempotency key", async () => {
    const { ctx, db } = setup();
    const { token } = await commitQuote(ctx, "idem-replay");
    const input = {
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: false,
      confirmationToken: token,
      idempotencyKey: "idem-replay",
    };
    const countAfterFirst = db.select().from(quotes).all().length;
    const first = await executeTool(tool("create_quote"), ctx, input);
    const second = await executeTool(tool("create_quote"), ctx, input);

    expect(second.model.ok).toBe(true);
    if (second.model.ok) {
      expect((second.model.data as any).replayed).toBe(true);
      expect((second.model.data as any).quote.id).toBe((first.model as any).data.quote.id);
    }
    expect(db.select().from(quotes).all().length).toBe(countAfterFirst);
  });

  it("creates an after-sales ticket with knowledge policy refs", async () => {
    const { ctx, db } = setup();
    const now = Date.now();
    db.insert(knowledgeDocs)
      .values({ id: "kd_doa", title: "DOA 政策", type: "policy", effectiveDate: "2026-01-01", contentHash: "hash", createdAt: now })
      .run();
    db.insert(knowledgeChunks)
      .values({ id: "kc_doa_1", docId: "kd_doa", heading: "DOA", content: "开箱即损可换新", embeddingJson: "[]", tokenCount: 1, createdAt: now })
      .run();

    const input = {
      customerId: "c_huachen",
      productId: "p_x1",
      issueType: "DOA" as const,
      description: "开箱发现屏幕损坏",
      policyRefs: ["kc_doa_1"],
    };
    const preview = await executeTool(tool("create_after_sales_ticket"), ctx, { ...input, dryRun: true });
    expect(preview.model.ok).toBe(true);
    const token = preview.artifacts!.find((artifact) => artifact.kind === "ticket")!.confirmationToken!;

    const result = await executeTool(tool("create_after_sales_ticket"), ctx, {
      ...input,
      dryRun: false,
      confirmationToken: token,
      idempotencyKey: "idem-ticket-1",
    });
    expect(result.model.ok).toBe(true);
    const created = db
      .select()
      .from(afterSalesTickets)
      .all()
      .find((ticket) => ticket.description === "开箱发现屏幕损坏");
    expect(created).toBeTruthy();
    expect(created!.status).toBe("open");
  });

  it("rejects converting another owner's quote", async () => {
    const { ctx } = setup();
    const { result } = await commitQuote(ctx, "idem-cross-quote");
    const quote = (result.model as any).data.quote;
    const otherCtx = { ...ctx, actor: { ...sales, id: "u_other" } };

    const converted = await executeTool(tool("convert_quote_to_order"), otherCtx, { quoteId: quote.id, dryRun: true });
    expect(converted.model.ok).toBe(false);
    if (!converted.model.ok) expect(converted.model.error.code).toBe("FORBIDDEN");
  });

  it("forbids non-managers from deciding approvals", async () => {
    const { ctx, db } = setup();
    db.update(priceRules).set({ discountBps: 9000 }).where(eq(priceRules.id, "pr_x1_a_promo")).run();
    const { result } = await commitQuote(ctx, "idem-non-manager-quote");
    const approvalId = (result.model as any).data.approvalId;
    expect(approvalId).toBeTruthy();

    expectAppError(() => decideApproval(ctx, approvalId, "approve", "ok", "idem-non-manager"), "FORBIDDEN");
  });

  it("scopes briefings to managers and validates dates", async () => {
    const { ctx } = setup();
    const team = await executeTool(tool("get_sales_briefing"), ctx, { scope: "team" });
    expect(team.model.ok).toBe(false);
    if (!team.model.ok) expect(team.model.error.code).toBe("FORBIDDEN");

    const badDate = await executeTool(tool("get_sales_briefing"), ctx, { scope: "self", date: "garbage" });
    expect(badDate.model.ok).toBe(false);
    if (!badDate.model.ok) expect(badDate.model.error.code).toBe("VALIDATION_ERROR");
  });
});
