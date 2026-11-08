import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { AppError, type ConversionLineSelection } from "@salespilot/shared";
import type { ToolContext } from "../tools/types.js";
import type { Db } from "../db/client.js";
import { customers, inventory, opportunities, orderLines, orders, products, quoteLines, quotes, stockReservations, warehouses } from "../db/schema.js";
import { checkCredit } from "./credit.js";
import { nextOrderNo } from "./documentNo.js";
import { planAllocation, reserveWithVersion } from "./inventory.js";
import { computeQuoteTotals } from "./pricing.js";

type QuoteLine = typeof quoteLines.$inferSelect;

export interface ResolvedConversionLine {
  line: QuoteLine;
  quantity: number;
}

const remainingOf = (line: QuoteLine) => line.quantity - line.convertedQuantity;

export function resolveConversionLines(
  db: Db,
  quoteId: string,
  selection?: ConversionLineSelection[],
): ResolvedConversionLine[] {
  const lines = db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId)).all();
  if (lines.length === 0) throw new AppError("INVALID_STATE", "报价没有可转订单的明细");

  if (!selection || selection.length === 0) {
    const resolved = lines.filter((line) => remainingOf(line) > 0).map((line) => ({ line, quantity: remainingOf(line) }));
    if (resolved.length === 0) throw new AppError("INVALID_STATE", "报价已全部转为订单");
    return resolved;
  }

  const seen = new Set<string>();
  return selection.map((item) => {
    if (seen.has(item.quoteLineId)) {
      throw new AppError("VALIDATION_ERROR", "同一报价明细不能重复提交");
    }
    seen.add(item.quoteLineId);
    const line = lines.find((row) => row.id === item.quoteLineId);
    if (!line) throw new AppError("NOT_FOUND", `报价明细不存在：${item.quoteLineId}`);
    const remaining = remainingOf(line);
    if (remaining <= 0) throw new AppError("INVALID_STATE", "该明细已全部转为订单");
    if (item.quantity > remaining) {
      throw new AppError("VALIDATION_ERROR", `转单数量超过剩余数量（剩余 ${remaining} 件）`, {
        quoteLineId: line.id,
        remaining,
        requested: item.quantity,
      });
    }
    return { line, quantity: item.quantity };
  });
}

export function computeConversionTotals(db: Db, selected: ResolvedConversionLine[]) {
  const taxRates = new Map(
    db.select({ id: products.id, taxRateBps: products.taxRateBps }).from(products).all().map((row) => [row.id, row.taxRateBps]),
  );
  return computeQuoteTotals(
    selected.map(({ line, quantity }) => ({
      quantity,
      unitPriceCents: line.unitPriceCents,
      taxRateBps: taxRates.get(line.productId) ?? 1300,
    })),
  );
}

export interface CreateOrderOptions {
  allowOverCredit?: boolean;
  lines?: ConversionLineSelection[];
}

export function createOrderFromQuote(
  ctx: ToolContext,
  quoteId: string,
  paymentTerms: string,
  options: CreateOrderOptions = {},
) {
  return ctx.sqlite.transaction(() => {
    const quote = ctx.db.select().from(quotes).where(eq(quotes.id, quoteId)).get();
    if (!quote) throw new AppError("NOT_FOUND", "报价不存在");
    if (quote.status !== "approved") throw new AppError("INVALID_STATE", "只有已批准的报价才能转订单");
    if (quote.validUntil < Date.now()) throw new AppError("INVALID_STATE", "报价已过期");
    const customer = ctx.db.select().from(customers).where(eq(customers.id, quote.customerId)).get();
    if (!customer) throw new AppError("NOT_FOUND", "客户不存在");

    const selected = resolveConversionLines(ctx.db, quote.id, options.lines);
    const totals = computeConversionTotals(ctx.db, selected);
    const credit = checkCredit(customer, totals.totalCents);
    if (credit.requiresApproval && !options.allowOverCredit) {
      throw new AppError("CREDIT_EXCEEDED", credit.reason ?? "信用额度不足");
    }

    const allocationsByLine = selected.map(({ line, quantity }) => {
      const invRows = ctx.db
        .select({
          warehouseId: inventory.warehouseId,
          warehouseName: warehouses.name,
          region: warehouses.region,
          onHand: inventory.onHand,
          reserved: inventory.reserved,
          safetyStock: inventory.safetyStock,
          etaDays: inventory.etaDays,
          version: inventory.version,
        })
        .from(inventory)
        .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .where(eq(inventory.productId, line.productId))
        .all();
      const plan = planAllocation(invRows as any, quantity);
      if (!plan.canFulfill) throw new AppError("OUT_OF_STOCK", `库存不足，缺少 ${plan.missing} 件`, { productId: line.productId }, true, "考虑拆仓、替代 SKU 或补货");
      return { line, quantity, plan };
    });

    const orderNo = nextOrderNo(ctx.db);
    const orderId = `o_${randomUUID()}`;
    ctx.db.insert(orders).values({
      id: orderId,
      orderNo,
      quoteId: quote.id,
      opportunityId: quote.opportunityId,
      customerId: quote.customerId,
      ownerId: quote.ownerId,
      status: "reserved",
      totalCents: totals.totalCents,
      paymentTerms,
      createdAt: Date.now(),
    }).run();

    for (const { line, quantity, plan } of allocationsByLine) {
      for (const allocation of plan.allocations) {
        const invRow = ctx.db
          .select()
          .from(inventory)
          .where(and(eq(inventory.warehouseId, allocation.warehouseId), eq(inventory.productId, line.productId)))
          .get();
        if (!invRow) throw new AppError("NOT_FOUND", "库存记录不存在");
        reserveWithVersion(ctx.sqlite, allocation.warehouseId, line.productId, allocation.quantity, invRow.version);
        ctx.db.insert(orderLines).values({ id: `ol_${randomUUID()}`, orderId, productId: line.productId, quantity: allocation.quantity, unitPriceCents: line.unitPriceCents, warehouseId: allocation.warehouseId }).run();
        ctx.db.insert(stockReservations).values({ id: `sr_${randomUUID()}`, orderId, productId: line.productId, warehouseId: allocation.warehouseId, quantity: allocation.quantity, status: "active" }).run();
      }
      ctx.db
        .update(quoteLines)
        .set({ convertedQuantity: line.convertedQuantity + quantity })
        .where(eq(quoteLines.id, line.id))
        .run();
    }

    ctx.db.update(customers).set({ creditUsedCents: customer.creditUsedCents + totals.totalCents }).where(eq(customers.id, customer.id)).run();

    const after = ctx.db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).all();
    const fullyConverted = after.every((line) => remainingOf(line) <= 0);
    const remainingQuantity = after.reduce((sum, line) => sum + Math.max(0, remainingOf(line)), 0);

    if (fullyConverted) {
      ctx.db.update(quotes).set({ status: "converted" }).where(eq(quotes.id, quote.id)).run();
      if (quote.opportunityId) {
        ctx.db
          .update(opportunities)
          .set({
            stage: "won",
            probability: 100,
            nextAction: null,
            nextActionDueAt: null,
            updatedAt: Date.now(),
          })
          .where(eq(opportunities.id, quote.opportunityId))
          .run();
      }
    } else if (quote.opportunityId) {
      ctx.db
        .update(opportunities)
        .set({
          stage: "negotiation",
          nextAction: `部分转单完成（${orderNo}），剩余 ${remainingQuantity} 件待转`,
          nextActionDueAt: null,
          updatedAt: Date.now(),
        })
        .where(eq(opportunities.id, quote.opportunityId))
        .run();
    }

    return {
      id: orderId,
      orderNo,
      status: "reserved",
      totalCents: totals.totalCents,
      fullyConverted,
      remainingQuantity,
    };
  })();
}
