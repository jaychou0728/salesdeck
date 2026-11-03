import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { AppError } from "@salespilot/shared";
import type { ToolContext } from "../tools/types.js";
import { customers, inventory, orderLines, orders, quoteLines, quotes, stockReservations, warehouses } from "../db/schema.js";
import { checkCredit } from "./credit.js";
import { planAllocation, reserveWithVersion } from "./inventory.js";

export function createOrderFromQuote(
  ctx: ToolContext,
  quoteId: string,
  paymentTerms: string,
  options: { allowOverCredit?: boolean } = {},
) {
  return ctx.sqlite.transaction(() => {
    const quote = ctx.db.select().from(quotes).where(eq(quotes.id, quoteId)).get();
    if (!quote) throw new AppError("NOT_FOUND", "报价不存在");
    if (quote.status !== "approved") throw new AppError("INVALID_STATE", "只有已批准的报价才能转订单");
    if (quote.validUntil < Date.now()) throw new AppError("INVALID_STATE", "报价已过期");
    const customer = ctx.db.select().from(customers).where(eq(customers.id, quote.customerId)).get();
    if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
    const credit = checkCredit(customer, quote.totalCents);
    if (credit.requiresApproval && !options.allowOverCredit) {
      throw new AppError("CREDIT_EXCEEDED", credit.reason ?? "信用额度不足");
    }
    const lines = ctx.db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).all();
    const allocationsByLine = lines.map((line) => {
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
      const plan = planAllocation(invRows as any, line.quantity);
      if (!plan.canFulfill) throw new AppError("OUT_OF_STOCK", `库存不足，缺少 ${plan.missing} 件`, { productId: line.productId }, true, "考虑拆仓、替代 SKU 或补货");
      return { line, plan };
    });
    const orderId = `o_${randomUUID()}`;
    ctx.db.insert(orders).values({
      id: orderId,
      orderNo: `SO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      quoteId: quote.id,
      customerId: quote.customerId,
      ownerId: quote.ownerId,
      status: "reserved",
      totalCents: quote.totalCents,
      paymentTerms,
      createdAt: Date.now(),
    }).run();
    for (const { line, plan } of allocationsByLine) {
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
    }
    ctx.db.update(customers).set({ creditUsedCents: customer.creditUsedCents + quote.totalCents }).where(eq(customers.id, customer.id)).run();
    ctx.db.update(quotes).set({ status: "converted" }).where(eq(quotes.id, quote.id)).run();
    return { id: orderId, status: "reserved", totalCents: quote.totalCents };
  })();
}
