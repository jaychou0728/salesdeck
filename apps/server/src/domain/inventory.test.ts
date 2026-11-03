import { describe, expect, it } from "vitest";
import { available, planAllocation, releaseReservation, reserveWithVersion } from "./inventory.js";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { inventory } from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("inventory", () => {
  it("plans a split across warehouses", () => {
    const rows = [
      { warehouseId: "w_sh", warehouseName: "上海仓", region: "上海", onHand: 0, reserved: 0, safetyStock: 0, etaDays: 1, version: 0 },
      { warehouseId: "w_sz", warehouseName: "苏州仓", region: "苏州", onHand: 150, reserved: 20, safetyStock: 0, etaDays: 2, version: 0 },
      { warehouseId: "w_cd", warehouseName: "成都仓", region: "成都", onHand: 50, reserved: 0, safetyStock: 0, etaDays: 3, version: 0 },
    ];
    expect(available(rows[1])).toBe(130);
    const plan = planAllocation(rows, 160);
    expect(plan.canFulfill).toBe(true);
    expect(plan.allocations).toEqual([
      { warehouseId: "w_sz", quantity: 130, etaDays: 2 },
      { warehouseId: "w_cd", quantity: 30, etaDays: 3 },
    ]);
  });

  it("rejects the second writer with a stale version", () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const row = db.select().from(inventory).where(eq(inventory.productId, "p_x1")).all().find((r) => r.warehouseId === "w_sz")!;
    reserveWithVersion(sqlite, "w_sz", "p_x1", 1, row.version);
    expect(() => reserveWithVersion(sqlite, "w_sz", "p_x1", 1, row.version)).toThrow(/库存已被其他操作占用/);
  });

  it("rejects reserving more than available stock", () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const row = db.select().from(inventory).where(eq(inventory.productId, "p_x1")).all().find((r) => r.warehouseId === "w_sh")!;
    expect(row.onHand).toBe(0);
    expect(() => reserveWithVersion(sqlite, "w_sh", "p_x1", 1, row.version)).toThrow(/库存已被其他操作占用/);
  });

  it("rejects releasing more than reserved", () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    expect(() => releaseReservation(sqlite, "w_sz", "p_x1", 9999)).toThrow(/预留不足/);
  });
});
