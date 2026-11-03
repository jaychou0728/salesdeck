import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "./seed.js";
import {
  contacts,
  customers,
  inventory,
  orderLines,
  orders,
  priceRules,
  products,
  quoteLines,
  quotes,
  stockReservations,
  users,
  warehouses,
} from "./schema.js";

describe("seed", () => {
  it("seeds demo data idempotently", () => {
    const { db } = makeTestDb();
    seedDatabase(db);
    seedDatabase(db);
    expect(db.select().from(users).all()).toHaveLength(2);
    expect(db.select().from(customers).all()).toHaveLength(8);
    expect(db.select().from(contacts).all()).toHaveLength(7);
    expect(db.select().from(products).all()).toHaveLength(20);
    expect(db.select().from(priceRules).all()).toHaveLength(5);
    expect(db.select().from(warehouses).all()).toHaveLength(3);
    expect(db.select().from(inventory).all()).toHaveLength(7);
    expect(db.select().from(quotes).all()).toHaveLength(3);
    expect(db.select().from(quoteLines).all()).toHaveLength(3);
    expect(db.select().from(orders).all()).toHaveLength(1);
    expect(db.select().from(orderLines).all()).toHaveLength(1);
    expect(db.select().from(stockReservations).all()).toHaveLength(1);
  });

  it("keeps the quote, order and reservation chain consistent", () => {
    const { db } = makeTestDb();
    const now = Date.now();
    seedDatabase(db, now);

    const quote3 = db.select().from(quotes).where(eq(quotes.id, "q_seed_3")).get();
    expect(quote3?.status).toBe("converted");
    const order = db.select().from(orders).where(eq(orders.id, "o_seed_1")).get();
    expect(order?.quoteId).toBe("q_seed_3");

    const quote1 = db.select().from(quotes).where(eq(quotes.id, "q_seed_1")).get();
    const quote2 = db.select().from(quotes).where(eq(quotes.id, "q_seed_2")).get();
    expect(quote1!.validUntil).toBeGreaterThan(now);
    expect(quote1!.validUntil).toBeLessThanOrEqual(now + 25 * 3600_000);
    expect(quote2!.validUntil).toBeGreaterThan(now);
    expect(quote2!.validUntil).toBeLessThanOrEqual(now + 41 * 3600_000);

    const allQuotes = db.select().from(quotes).all();
    for (const quote of allQuotes) {
      const sum = db
        .select()
        .from(quoteLines)
        .where(eq(quoteLines.quoteId, quote.id))
        .all()
        .reduce((total, line) => total + line.lineTotalCents, 0);
      expect(sum).toBe(quote.subtotalCents);
    }

    const zhangContacts = db.select().from(contacts).where(eq(contacts.name, "张总")).all();
    expect(zhangContacts).toHaveLength(2);
    expect(new Set(zhangContacts.map((contact) => contact.customerId)).size).toBe(2);
  });

  it("prepares the credit and stock traps", () => {
    const { db } = makeTestDb();
    seedDatabase(db);
    const huachen = db.select().from(customers).where(eq(customers.id, "c_huachen")).get();
    expect(huachen?.creditLimitCents).toBe(120_000_000);
    expect(huachen?.creditUsedCents).toBe(110_400_000);
    const x1 = db.select().from(products).where(eq(products.sku, "X1")).get();
    const rows = db.select().from(inventory).where(eq(inventory.productId, x1!.id)).all();
    expect(rows.reduce((sum, row) => sum + row.onHand - row.reserved, 0)).toBe(180);
    expect(Math.max(...rows.map((row) => row.onHand - row.reserved))).toBe(130);
    const shanghai = db.select().from(warehouses).where(eq(warehouses.region, "上海")).get();
    const shanghaiRow = rows.find((row) => row.warehouseId === shanghai!.id);
    expect(shanghaiRow!.onHand - shanghaiRow!.reserved).toBe(0);
  });
});
