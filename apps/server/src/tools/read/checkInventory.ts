import { eq, like, or } from "drizzle-orm";
import { CheckInventoryInput, fail, ok } from "@salespilot/shared";
import { inventory, products, warehouses } from "../../db/schema.js";
import { available, planAllocation } from "../../domain/inventory.js";
import type { ToolDefinition } from "../types.js";

export const checkInventory: ToolDefinition<CheckInventoryInput, unknown> = {
  name: "check_inventory",
  description: "查询 SKU 在多仓的可用库存、ETA 和拆仓方案；可判断能否满足数量，并遵守 region/needByDate 过滤。",
  inputSchema: CheckInventoryInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const productRows = ctx.db
      .select()
      .from(products)
      .where(or(eq(products.sku, input.skuQuery), like(products.name, `%${input.skuQuery}%`)))
      .all();
    if (productRows.length === 0) {
      return { model: ok({ product: null, candidates: [], warehouses: [], canFulfill: false, allocations: [], missing: 0 }) };
    }

    const product = productRows[0];
    const allRows = ctx.db
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
      .where(eq(inventory.productId, product.id))
      .all()
      .map((row) => ({ ...row, available: available(row) }));

    let daysUntil: number | null = null;
    if (input.needByDate) {
      const parsed = Date.parse(input.needByDate);
      if (Number.isNaN(parsed)) return { model: fail("VALIDATION_ERROR", "needByDate 格式无效") };
      daysUntil = Math.ceil((parsed - Date.now()) / 86400000);
    }

    const regionRows = input.region ? allRows.filter((row) => row.region === input.region) : allRows;
    const filteredRows = daysUntil === null ? regionRows : regionRows.filter((row) => row.etaDays <= daysUntil);
    const plan = input.quantity
      ? planAllocation(filteredRows, input.quantity)
      : { canFulfill: true, allocations: [], missing: 0 };

    return {
      model: ok({
        product,
        candidates: productRows.map((row) => ({ id: row.id, sku: row.sku, name: row.name })),
        warehouses: allRows,
        requestedQty: input.quantity ?? null,
        canFulfill: plan.canFulfill,
        allocations: plan.allocations,
        missing: plan.missing,
        appliedFilters: { region: input.region ?? null, needByDate: input.needByDate ?? null, daysUntil },
        alternatives: allRows.filter((row) => !filteredRows.includes(row)),
      }),
    };
  },
};
