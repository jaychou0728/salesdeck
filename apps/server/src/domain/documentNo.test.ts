import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { nextOrderNo, nextQuoteNo, nextTicketNo } from "./documentNo.js";

describe("document numbers", () => {
  it("continues the seeded quote, order and ticket sequences", () => {
    const { db } = makeTestDb();
    seedDatabase(db);
    const year = new Date().getFullYear();
    expect(nextQuoteNo(db)).toBe(`Q-${year}-0104`);
    expect(nextOrderNo(db)).toBe(`SO-${year}-0104`);
    expect(nextTicketNo(db)).toBe(`AS-${year}-0001`);
  });
});
