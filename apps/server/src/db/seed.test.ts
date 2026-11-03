import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "./seed.js";
import { customers, inventory, products } from "./schema.js";

describe("seed", () => {
  it("seeds demo data idempotently", () => {
    const { db } = makeTestDb();
    seedDatabase(db);
    seedDatabase(db);
    expect(db.select().from(customers).all()).toHaveLength(8);
    expect(db.select().from(products).all()).toHaveLength(20);
  });

  it("prepares the credit and stock traps", () => {
    const { db } = makeTestDb();
    seedDatabase(db);
    const huachen = db.select().from(customers).where(eq(customers.id, "c_huachen")).get();
    expect(huachen?.creditLimitCents).toBe(5_000_000);
    expect(huachen?.creditUsedCents).toBe(4_600_000);
    const x1 = db.select().from(products).where(eq(products.sku, "X1")).get();
    const rows = db.select().from(inventory).where(eq(inventory.productId, x1!.id)).all();
    expect(rows.reduce((sum, row) => sum + row.onHand - row.reserved, 0)).toBeGreaterThanOrEqual(120);
  });
});
