import { and, eq, inArray } from "drizzle-orm";
import { GetPricingInput, fail, ok } from "@salesdeck/shared";
import { customers, priceRules, products } from "../../db/schema.js";
import { assertCustomerAccess } from "../../domain/permissions.js";
import { computeQuoteTotals, computeUnitPrice } from "../../domain/pricing.js";
import type { ToolDefinition } from "../types.js";

export const getPricing: ToolDefinition<GetPricingInput, unknown> = {
  name: "get_pricing",
  description: "根据客户等级与数量计算阶梯价、促销、价格底线和含税总额。价格只以服务端计算为准。",
  inputSchema: GetPricingInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const customer = ctx.db.select().from(customers).where(eq(customers.id, input.customerId)).get();
    if (!customer) return { model: fail("NOT_FOUND", "客户不存在") };
    assertCustomerAccess(ctx.actor, customer);
    const skus = input.items.map((item) => item.sku);
    const productRows = ctx.db.select().from(products).where(inArray(products.sku, skus)).all();
    const knownSkus = new Set(productRows.map((row) => row.sku));
    const unknownSkus = [...new Set(skus.filter((sku) => !knownSkus.has(sku)))];
    if (unknownSkus.length > 0) {
      return { model: fail("NOT_FOUND", `SKU 不存在: ${unknownSkus.join(", ")}`) };
    }
    const now = Date.now();
    const lines = input.items.map((item) => {
      const product = productRows.find((row) => row.sku === item.sku);
      if (!product) return null;
      const rules = ctx.db
        .select()
        .from(priceRules)
        .where(and(eq(priceRules.productId, product.id), eq(priceRules.customerLevel, customer.level)))
        .all();
      const price = computeUnitPrice({
        customerLevel: customer.level,
        quantity: item.quantity,
        listPriceCents: product.listPriceCents,
        floorPriceCents: product.floorPriceCents,
        rules,
        now,
      });
      return {
        sku: product.sku,
        quantity: item.quantity,
        listPriceCents: product.listPriceCents,
        tierPriceCents: price.tierPriceCents,
        finalPriceCents: price.finalPriceCents,
        floorPriceCents: price.floorPriceCents,
        belowFloor: price.belowFloor,
        lineTotalCents: price.finalPriceCents * item.quantity,
        taxRateBps: product.taxRateBps,
        ruleRefs: price.ruleRefs,
      };
    });
    const validLines = lines.filter((line): line is NonNullable<typeof line> => line !== null);
    return {
      model: ok({
        lines: validLines,
        totals: computeQuoteTotals(
          validLines.map((line) => ({ quantity: line.quantity, unitPriceCents: line.finalPriceCents, taxRateBps: line.taxRateBps })),
        ),
      }),
    };
  },
};
