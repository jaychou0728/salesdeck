import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { GetSalesBriefingInput, fail, ok } from "@salespilot/shared";
import { customers, inventory, products, quotes, users } from "../../db/schema.js";
import type { ToolDefinition } from "../types.js";

export const getSalesBriefing: ToolDefinition<GetSalesBriefingInput, unknown> = {
  name: "get_sales_briefing",
  description: "生成销售晨报：信用风险、库存风险、48 小时内到期报价。销售只能看自己，经理可看团队。",
  inputSchema: GetSalesBriefingInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    if (input.scope === "team" && ctx.actor.role !== "manager") {
      return { model: fail("FORBIDDEN", "销售只能查看自己的晨报") };
    }
    if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { model: fail("VALIDATION_ERROR", "date 格式应为 YYYY-MM-DD") };
    }
    const now = input.date
      ? (() => {
          const [y, m, d] = input.date.split("-").map(Number);
          return y && m && d ? new Date(y, m - 1, d, 23, 59, 59).getTime() : Date.now();
        })()
      : Date.now();
    const teamUserIds = ctx.actor.role === "manager" && input.scope === "team"
      ? ctx.db.select({ id: users.id }).from(users).where(eq(users.teamId, ctx.actor.teamId)).all().map((user) => user.id)
      : [ctx.actor.id];
    const customerScope = ctx.actor.role === "manager" && input.scope === "team"
      ? inArray(customers.ownerId, teamUserIds)
      : eq(customers.ownerId, ctx.actor.id);
    const customerRows = ctx.db.select().from(customers).where(customerScope).all();
    const creditAlerts = customerRows
      .filter((customer) => customer.creditLimitCents > 0 && customer.creditUsedCents / customer.creditLimitCents >= 0.8)
      .map((customer) => ({
        type: "credit_risk",
        severity: "warning",
        entityRef: { kind: "customer", id: customer.id, name: customer.name },
        why: `信用已用 ${Math.round((customer.creditUsedCents / customer.creditLimitCents) * 100)}%，可用 ${((customer.creditLimitCents - customer.creditUsedCents) / 100).toFixed(2)} 元`,
        suggestedAction: "查看客户 360，考虑拆单、预付或提额审批",
      }));
    const inventoryAlerts = ctx.db
      .select({ productId: inventory.productId, warehouseId: inventory.warehouseId, onHand: inventory.onHand, reserved: inventory.reserved, safetyStock: inventory.safetyStock, sku: products.sku, name: products.name })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .all()
      .filter((row) => row.onHand - row.reserved < row.safetyStock)
      .map((row) => ({
        type: "inventory_risk",
        severity: "warning",
        entityRef: { kind: "product", id: row.productId, name: row.name, warehouseId: row.warehouseId },
        why: `${row.sku} 可用 ${row.onHand - row.reserved}，低于安全库存 ${row.safetyStock}`,
        suggestedAction: "检查拆仓方案或安排补货",
      }));
    const expiring = ctx.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.status, "approved"), lte(quotes.validUntil, now + 48 * 3600_000), gte(quotes.validUntil, now)))
      .all()
      .filter((quote) => teamUserIds.includes(quote.ownerId))
      .map((quote) => ({
        type: "quote_expiring",
        severity: "info",
        entityRef: { kind: "quote", id: quote.id, name: quote.quoteNo },
        why: `报价将在 ${Math.ceil((quote.validUntil - now) / 3600_000)} 小时内过期`,
        suggestedAction: "联系客户确认，或重新生成报价",
      }));
    return { model: ok({ alerts: [...creditAlerts, ...inventoryAlerts, ...expiring] }) };
  },
};
