import { eq } from "drizzle-orm";
import { ConvertQuoteToOrderInput, fail, ok } from "@salespilot/shared";
import { customers, inventory, quoteLines, quotes, warehouses } from "../../db/schema.js";
import { createApproval } from "../../domain/approvals.js";
import { consumeConfirmationToken, issueConfirmationToken } from "../../domain/confirmation.js";
import { checkCredit } from "../../domain/credit.js";
import { planAllocation } from "../../domain/inventory.js";
import { withIdempotency } from "../../domain/idempotency.js";
import { computeConversionTotals, createOrderFromQuote, resolveConversionLines } from "../../domain/orders.js";
import { assertCustomerAccess } from "../../domain/permissions.js";
import { assertQuoteConvertible } from "../../domain/state.js";
import type { ToolDefinition } from "../types.js";

const businessPayload = (input: ConvertQuoteToOrderInput) => ({
  quoteId: input.quoteId,
  lines: input.lines,
  paymentTerms: input.paymentTerms,
});

export const convertQuoteToOrder: ToolDefinition<ConvertQuoteToOrderInput, unknown> = {
  name: "convert_quote_to_order",
  description:
    "将已批准报价转订单。可指定明细与数量做部分转单（拆单），剩余明细之后可继续转；不传 lines 时转换全部剩余数量。dry-run 检查信用与库存；信用不足时创建经理审批，不直接创建订单。",
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

    const selected = resolveConversionLines(ctx.db, quote.id, input.lines);
    const totals = computeConversionTotals(ctx.db, selected);
    const credit = checkCredit(customer, totals.totalCents);
    const conversionByLine = new Map(selected.map((item) => [item.line.id, item.quantity]));

    const stockChecks = selected.map(({ line, quantity }) => {
      const invRows = ctx.db
        .select({ warehouseId: inventory.warehouseId, warehouseName: warehouses.name, region: warehouses.region, onHand: inventory.onHand, reserved: inventory.reserved, safetyStock: inventory.safetyStock, etaDays: inventory.etaDays, version: inventory.version })
        .from(inventory)
        .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .where(eq(inventory.productId, line.productId))
        .all();
      const plan = planAllocation(invRows as any, quantity);
      return { quoteLineId: line.id, productId: line.productId, quantity, canFulfill: plan.canFulfill, missing: plan.missing, allocations: plan.allocations };
    });
    const canFulfill = stockChecks.every((check) => check.canFulfill);

    const allLines = ctx.db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).all();
    const previewLines = allLines.map((line) => {
      const convertingQuantity = conversionByLine.get(line.id) ?? 0;
      return {
        ...line,
        remainingQuantity: line.quantity - line.convertedQuantity,
        convertingQuantity,
        remainingAfter: line.quantity - line.convertedQuantity - convertingQuantity,
      };
    });
    const fullyConvertedAfter = previewLines.every((line) => line.remainingAfter <= 0);

    const preview = {
      quoteId: quote.id,
      quoteNo: quote.quoteNo,
      totalCents: totals.totalCents,
      quoteTotalCents: quote.totalCents,
      creditAvailableCents: credit.availableCents,
      requiresApproval: credit.requiresApproval,
      reason: credit.reason,
      lines: previewLines,
      stockChecks,
      canFulfill,
      partiallyConverted: allLines.some((line) => line.convertedQuantity > 0),
      fullyConvertedAfter,
    };

    if (input.dryRun) {
      if (!canFulfill) {
        return { model: fail("OUT_OF_STOCK", "库存不足，无法转订单", { details: { stockChecks }, recoverable: true, suggestedAction: "考虑拆仓、替代 SKU 或补货" }) };
      }
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
          payload: {
            quoteId: quote.id,
            lines: input.lines ?? null,
            paymentTerms: input.paymentTerms ?? customer.paymentTerms,
            amountCents: totals.totalCents,
          },
        });
        return { status: "pending_approval", approvalId, preview };
      }
      return {
        status: "committed",
        order: createOrderFromQuote(ctx, quote.id, input.paymentTerms ?? customer.paymentTerms, { lines: input.lines }),
        preview,
      };
    });
    return { model: ok({ ...result.value, replayed: result.replayed }) };
  },
};
