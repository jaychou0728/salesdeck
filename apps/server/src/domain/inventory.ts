import type Database from "better-sqlite3";
import { AppError } from "@salesdeck/shared";

export interface InventoryView {
  warehouseId: string;
  warehouseName: string;
  region: string;
  onHand: number;
  reserved: number;
  safetyStock: number;
  etaDays: number;
  version: number;
}

export interface Allocation {
  warehouseId: string;
  quantity: number;
  etaDays: number;
}

export function available(row: Pick<InventoryView, "onHand" | "reserved">): number {
  return row.onHand - row.reserved;
}

export function planAllocation(rows: InventoryView[], requestedQty: number) {
  const sorted = [...rows]
    .filter((row) => available(row) > 0)
    .sort((a, b) => a.etaDays - b.etaDays || available(b) - available(a));
  const allocations: Allocation[] = [];
  let remaining = requestedQty;
  for (const row of sorted) {
    const take = Math.min(remaining, available(row));
    if (take <= 0) continue;
    allocations.push({ warehouseId: row.warehouseId, quantity: take, etaDays: row.etaDays });
    remaining -= take;
    if (remaining === 0) break;
  }
  return { canFulfill: remaining === 0, allocations, missing: remaining };
}

export function reserveWithVersion(
  sqlite: Database.Database,
  warehouseId: string,
  productId: string,
  quantity: number,
  expectedVersion: number,
) {
  const result = sqlite
    .prepare(
      `update inventory
         set reserved = reserved + ?, version = version + 1
       where warehouse_id = ? and product_id = ? and version = ?
         and (on_hand - reserved) >= ?`,
    )
    .run(quantity, warehouseId, productId, expectedVersion, quantity);
  if (result.changes !== 1) {
    throw new AppError("CONFLICT", "库存已被其他操作占用，请重试", { warehouseId, productId }, true);
  }
}

export function releaseReservation(sqlite: Database.Database, warehouseId: string, productId: string, quantity: number) {
  const result = sqlite
    .prepare(
      `update inventory
         set reserved = reserved - ?, version = version + 1
       where warehouse_id = ? and product_id = ? and reserved >= ?`,
    )
    .run(quantity, warehouseId, productId, quantity);
  if (result.changes !== 1) {
    throw new AppError("CONFLICT", "释放预留失败：预留不足或记录不存在", { warehouseId, productId }, false);
  }
}
