import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "./seed.js";
import { startOfMonthLocal } from "../lib/time.js";
import {
  contacts,
  customers,
  followUps,
  inventory,
  opportunities,
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
    expect(db.select().from(users).all()).toHaveLength(4);
    expect(db.select().from(customers).all()).toHaveLength(15);
    expect(db.select().from(contacts).all()).toHaveLength(14);
    expect(db.select().from(products).all()).toHaveLength(21);
    expect(db.select().from(priceRules).all()).toHaveLength(5);
    expect(db.select().from(warehouses).all()).toHaveLength(3);
    expect(db.select().from(inventory).all()).toHaveLength(12);
    expect(db.select().from(quotes).all()).toHaveLength(7);
    expect(db.select().from(quoteLines).all()).toHaveLength(7);
    expect(db.select().from(orders).all()).toHaveLength(4);
    expect(db.select().from(orderLines).all()).toHaveLength(4);
    expect(db.select().from(stockReservations).all()).toHaveLength(4);
    expect(db.select().from(opportunities).all()).toHaveLength(12);
    expect(db.select().from(followUps).all()).toHaveLength(6);
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

  it("seeds the war room story", () => {
    const { db } = makeTestDb();
    const now = Date.now();
    seedDatabase(db, now);
    const huachen = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
    expect(huachen?.stage).toBe("quote");
    expect(huachen?.amountCents).toBe(28_000_000);
    expect(huachen?.riskLevel).toBe("high");
    const linkedQuote = db.select().from(quotes).where(eq(quotes.opportunityId, "o_huachen_server")).get();
    expect(linkedQuote?.totalCents).toBe(31_640_000);
    const srv = db.select().from(products).where(eq(products.sku, "SRV")).get();
    const stock = db.select().from(inventory).where(eq(inventory.productId, srv!.id)).all();
    expect(stock.reduce((sum, row) => sum + row.onHand - row.reserved, 0)).toBe(15);
  });

  it("seeds team sales for manager ranking", () => {
    const { db } = makeTestDb();
    const now = new Date("2026-11-02T10:00:00+08:00").getTime();
    seedDatabase(db, now);
    const monthStart = startOfMonthLocal(now);

    const rows = db.select().from(orders).all().filter((order) => order.createdAt >= monthStart);
    for (const ownerId of ["u_sales_lin", "u_sales_wang", "u_sales_chen"]) {
      expect(rows.some((order) => order.ownerId === ownerId)).toBe(true);
    }

    const monthlyOrderIds = ["o_seed_lin_month", "o_seed_wang_month", "o_seed_chen_month"];
    const monthlyOrders = db.select().from(orders).all().filter((order) => monthlyOrderIds.includes(order.id));
    expect(monthlyOrders).toHaveLength(3);
    for (const order of monthlyOrders) {
      expect(order.createdAt).toBeGreaterThanOrEqual(monthStart);
      expect(order.createdAt).toBeLessThanOrEqual(now);
    }
  });
});
