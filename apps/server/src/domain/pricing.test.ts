import { describe, expect, it } from "vitest";
import { computeQuoteTotals, computeUnitPrice } from "./pricing.js";

const rules = [
  { id: "r1", customerLevel: "A" as const, minQty: 1, unitPriceCents: 749_900, discountBps: 0, priority: 10, effectiveFrom: 0, effectiveTo: null },
  { id: "r2", customerLevel: "A" as const, minQty: 100, unitPriceCents: 732_000, discountBps: 100, priority: 30, effectiveFrom: 0, effectiveTo: null },
];

describe("pricing", () => {
  it("uses the highest quantity tier and promo", () => {
    const result = computeUnitPrice({ customerLevel: "A", quantity: 120, listPriceCents: 749_900, floorPriceCents: 699_900, rules, now: 1000 });
    expect(result.tierPriceCents).toBe(732_000);
    expect(result.finalPriceCents).toBe(724_680);
    expect(result.ruleRefs).toContain("r2");
  });

  it("flags below-floor pricing", () => {
    const result = computeUnitPrice({ customerLevel: "A", quantity: 1, listPriceCents: 690_000, floorPriceCents: 699_900, rules: [], now: 1000 });
    expect(result.finalPriceCents).toBe(690_000);
    expect(result.belowFloor).toBe(true);
  });

  it("computes totals with tax", () => {
    const totals = computeQuoteTotals([{ quantity: 2, unitPriceCents: 100_000, taxRateBps: 1300 }]);
    expect(totals.subtotalCents).toBe(200_000);
    expect(totals.taxTotalCents).toBe(26_000);
    expect(totals.totalCents).toBe(226_000);
  });
});
