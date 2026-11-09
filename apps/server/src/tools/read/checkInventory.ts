import { eq, like, or } from "drizzle-orm";
import { CheckInventoryInput, fail, ok } from "@salesdeck/shared";
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
      return {
        model: ok({
          product: null,
          candidates: [],
          warehouses: [],
          ambiguousProduct: false,
          requestedQty: input.quantity ?? null,
          canFulfill: false,
          allocations: [],
          missing: 0,
          appliedFilters: { region: input.region ?? null, needByDate: input.needByDate ?? null, daysUntil: null },
          alternatives: [],
        }),
      };
    }

    const product = productRows.find((row) => row.sku === input.skuQuery) ?? productRows[0];
    const productView = {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      unit: product.unit,
      listPriceCents: product.listPriceCents,
      floorPriceCents: product.floorPriceCents,
      taxRateBps: product.taxRateBps,
      status: product.status,
    };

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
      const [y, m, d] = input.needByDate.split("-").map(Number);
      if (!y || !m || !d) return { model: fail("VALIDATION_ERROR", "needByDate 格式无效") };
      const target = new Date(y, m - 1, d).getTime();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysUntil = Math.round((target - today.getTime()) / 86400000);
      if (!Number.isFinite(target) || !Number.isFinite(daysUntil)) {
        return { model: fail("VALIDATION_ERROR", "needByDate 格式无效") };
      }
    }

    const regionRows = input.region ? allRows.filter((row) => row.region === input.region) : allRows;
    const filteredRows = daysUntil === null ? regionRows : regionRows.filter((row) => row.etaDays <= daysUntil);
    const plan = input.quantity
      ? planAllocation(filteredRows, input.quantity)
      : { canFulfill: true, allocations: [], missing: 0 };

    const filteredWarehouseIds = new Set(filteredRows.map((row) => row.warehouseId));
    return {
      model: ok({
        product: productView,
        candidates: productRows.map((row) => ({ id: row.id, sku: row.sku, name: row.name })),
        warehouses: allRows,
        ambiguousProduct: productRows.length > 1,
        requestedQty: input.quantity ?? null,
        canFulfill: plan.canFulfill,
        allocations: plan.allocations,
        missing: plan.missing,
        appliedFilters: { region: input.region ?? null, needByDate: input.needByDate ?? null, daysUntil },
        alternatives: allRows.filter((row) => !filteredWarehouseIds.has(row.warehouseId)),
      }),
    };
  },
};
