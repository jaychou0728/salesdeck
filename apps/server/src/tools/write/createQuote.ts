import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { CreateQuoteInput, fail, ok } from "@salespilot/shared";
import { contacts, customers, opportunities, priceRules, products, quoteLines, quotes } from "../../db/schema.js";
import { createApproval } from "../../domain/approvals.js";
import { consumeConfirmationToken, issueConfirmationToken } from "../../domain/confirmation.js";
import { withIdempotency } from "../../domain/idempotency.js";
import { assertCustomerAccess } from "../../domain/permissions.js";
import { computeQuoteTotals, computeUnitPrice } from "../../domain/pricing.js";
import type { ToolDefinition } from "../types.js";

const businessPayload = (input: CreateQuoteInput) => ({
  customerId: input.customerId,
  contactId: input.contactId,
  opportunityId: input.opportunityId,
  lines: input.lines,
  validDays: input.validDays,
  notes: input.notes,
});

export const createQuote: ToolDefinition<CreateQuoteInput, unknown> = {
  name: "create_quote",
  description: "生成报价单。必须先 dry-run 返回预览与确认令牌，用户确认后才能提交；价格由服务端计算。",
  inputSchema: CreateQuoteInput,
  kind: "write",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const customer = ctx.db.select().from(customers).where(eq(customers.id, input.customerId)).get();
    if (!customer) return { model: fail("NOT_FOUND", "客户不存在") };
    assertCustomerAccess(ctx.actor, customer);
    const contact = ctx.db.select().from(contacts).where(eq(contacts.id, input.contactId)).get();
    if (!contact || contact.customerId !== customer.id) return { model: fail("NOT_FOUND", "联系人不存在或不属于该客户") };
    if (input.opportunityId) {
      const opportunity = ctx.db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).get();
      if (!opportunity || opportunity.customerId !== customer.id) {
        return { model: fail("NOT_FOUND", "商机不存在或不属于该客户") };
      }
    }

    const productRows = ctx.db.select().from(products).all();
    const missing = input.lines.find((line) => !productRows.some((product) => product.sku === line.sku));
    if (missing) return { model: fail("NOT_FOUND", `SKU 不存在: ${missing.sku}`) };
    const now = Date.now();
    const linePreviews = input.lines.map((line) => {
      const product = productRows.find((row) => row.sku === line.sku)!;
      const rules = ctx.db.select().from(priceRules).where(eq(priceRules.productId, product.id)).all();
      const price = computeUnitPrice({ customerLevel: customer.level, quantity: line.quantity, listPriceCents: product.listPriceCents, floorPriceCents: product.floorPriceCents, rules, now });
      return { productId: product.id, sku: product.sku, name: product.name, quantity: line.quantity, unitPriceCents: price.finalPriceCents, floorPriceCents: price.floorPriceCents, belowFloor: price.belowFloor, lineTotalCents: price.finalPriceCents * line.quantity, taxRateBps: product.taxRateBps, ruleRefs: price.ruleRefs };
    });
    const totals = computeQuoteTotals(linePreviews.map((line) => ({ quantity: line.quantity, unitPriceCents: line.unitPriceCents, taxRateBps: line.taxRateBps })));
    const preview = {
      customer: { id: customer.id, name: customer.name, level: customer.level, creditAvailableCents: customer.creditLimitCents - customer.creditUsedCents },
      contact,
      lines: linePreviews,
      totals,
      validUntil: now + input.validDays * 86400_000,
      riskFlags: linePreviews.some((line) => line.belowFloor) ? [{ code: "PRICE_FLOOR", message: "存在低于价格底线的明细，需经理审批", severity: "warning" as const }] : [],
    };

    if (input.dryRun) {
      const { token, expiresAt } = issueConfirmationToken(ctx.db, { actorId: ctx.actor.id, toolName: "create_quote", payload: businessPayload(input) });
      return {
        model: ok({ status: "pending_confirmation", preview, expiresAt }),
        artifacts: [{ kind: "quote", toolName: "create_quote", title: "报价单预览", payload: { preview, input: businessPayload(input) }, confirmationToken: token }],
      };
    }

    const result = withIdempotency(ctx.db, { key: input.idempotencyKey!, actorId: ctx.actor.id, toolName: "create_quote", request: businessPayload(input) }, () => {
      consumeConfirmationToken(ctx.db, input.confirmationToken!, { actorId: ctx.actor.id, toolName: "create_quote", payload: businessPayload(input) });
      const quoteId = `q_${randomUUID()}`;
      const status = linePreviews.some((line) => line.belowFloor) ? "pending_approval" : "approved";
      ctx.db.insert(quotes).values({
        id: quoteId,
        quoteNo: `Q-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        customerId: customer.id,
        contactId: contact.id,
        opportunityId: input.opportunityId ?? null,
        ownerId: customer.ownerId,
        status,
        subtotalCents: totals.subtotalCents,
        discountTotalCents: totals.discountTotalCents,
        taxTotalCents: totals.taxTotalCents,
        totalCents: totals.totalCents,
        validUntil: preview.validUntil,
        riskFlags: JSON.stringify(preview.riskFlags),
        notes: input.notes ?? null,
        createdAt: now,
      }).run();
      for (const line of linePreviews) {
        ctx.db.insert(quoteLines).values({
          id: `ql_${randomUUID()}`,
          quoteId,
          productId: line.productId,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          discountRateBps: 0,
          lineTotalCents: line.lineTotalCents,
          warehouseId: null,
        }).run();
      }
      let approvalId: string | undefined;
      if (status === "pending_approval") {
        approvalId = createApproval(ctx, {
          type: "quote_price",
          targetType: "quote",
          targetId: quoteId,
          requesterId: ctx.actor.id,
          reason: "报价低于价格底线，需要经理审批",
          payload: { quoteId },
        });
      }
      if (input.opportunityId) {
        ctx.db
          .update(opportunities)
          .set({ stage: "quote", updatedAt: now })
          .where(eq(opportunities.id, input.opportunityId))
          .run();
      }
      return { quote: { id: quoteId, status, ...preview }, approvalId };
    });
    return { model: ok({ status: "committed", quote: result.value.quote, approvalId: result.value.approvalId, replayed: result.replayed }) };
  },
};
