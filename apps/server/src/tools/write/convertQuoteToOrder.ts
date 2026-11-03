import { eq } from "drizzle-orm";
import { ConvertQuoteToOrderInput, fail, ok } from "@salespilot/shared";
import { customers, quoteLines, quotes } from "../../db/schema.js";
import { createApproval } from "../../domain/approvals.js";
import { consumeConfirmationToken, issueConfirmationToken } from "../../domain/confirmation.js";
import { checkCredit } from "../../domain/credit.js";
import { withIdempotency } from "../../domain/idempotency.js";
import { createOrderFromQuote } from "../../domain/orders.js";
import { assertCustomerAccess } from "../../domain/permissions.js";
import { assertQuoteConvertible } from "../../domain/state.js";
import type { ToolDefinition } from "../types.js";

const businessPayload = (input: ConvertQuoteToOrderInput) => ({ quoteId: input.quoteId, paymentTerms: input.paymentTerms });

export const convertQuoteToOrder: ToolDefinition<ConvertQuoteToOrderInput, unknown> = {
  name: "convert_quote_to_order",
  description: "将已批准报价转订单。dry-run 检查信用与库存；信用不足时创建经理审批，不直接创建订单。",
  inputSchema: ConvertQuoteToOrderInput,
  kind: "write",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const quote = ctx.db.select().from(quotes).where(eq(quotes.id, input.quoteId)).get();
    if (!quote) return { model: fail("NOT_FOUND", "报价不存在") };
    assertQuoteConvertible(quote, Date.now());
    const customer = ctx.db.select().from(customers).where(eq(customers.id, quote.customerId)).get();
    if (!customer) return { model: fail("NOT_FOUND", "客户不存在") };
    assertCustomerAccess(ctx.actor, customer);
    const credit = checkCredit(customer, quote.totalCents);
    const lines = ctx.db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).all();
    const preview = {
      quoteId: quote.id,
      quoteNo: quote.quoteNo,
      totalCents: quote.totalCents,
      creditAvailableCents: credit.availableCents,
      requiresApproval: credit.requiresApproval,
      reason: credit.reason,
      lines,
    };
    if (input.dryRun) {
      const { token, expiresAt } = issueConfirmationToken(ctx.db, { actorId: ctx.actor.id, toolName: "convert_quote_to_order", payload: businessPayload(input) });
      return {
        model: ok({ status: "pending_confirmation", preview, expiresAt }),
        artifacts: [{ kind: "quote", toolName: "convert_quote_to_order", title: "转订单预览", payload: { preview, input: businessPayload(input) }, confirmationToken: token }],
      };
    }
    const result = withIdempotency(ctx.db, { key: input.idempotencyKey!, actorId: ctx.actor.id, toolName: "convert_quote_to_order", request: businessPayload(input) }, () => {
      consumeConfirmationToken(ctx.db, input.confirmationToken!, { actorId: ctx.actor.id, toolName: "convert_quote_to_order", payload: businessPayload(input) });
      if (credit.requiresApproval) {
        const approvalId = createApproval(ctx, {
          type: "order_conversion",
          targetType: "quote",
          targetId: quote.id,
          requesterId: ctx.actor.id,
          reason: credit.reason ?? "信用额度不足",
          payload: { quoteId: quote.id, paymentTerms: input.paymentTerms ?? customer.paymentTerms },
        });
        return { status: "pending_approval", approvalId, preview };
      }
      return { status: "committed", order: createOrderFromQuote(ctx, quote.id, input.paymentTerms ?? customer.paymentTerms), preview };
    });
    return { model: ok({ ...result.value, replayed: result.replayed }) };
  },
};
