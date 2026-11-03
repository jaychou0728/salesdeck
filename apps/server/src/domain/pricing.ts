import type { CustomerLevel } from "@salespilot/shared";

export interface PriceRule {
  id: string;
  customerLevel: CustomerLevel;
  minQty: number;
  unitPriceCents: number;
  discountBps: number;
  priority: number;
  effectiveFrom: number;
  effectiveTo: number | null;
}

export interface UnitPriceInput {
  customerLevel: CustomerLevel;
  quantity: number;
  listPriceCents: number;
  floorPriceCents: number;
  rules: PriceRule[];
  now: number;
}

export interface UnitPriceResult {
  tierPriceCents: number;
  finalPriceCents: number;
  floorPriceCents: number;
  belowFloor: boolean;
  ruleRefs: string[];
}

export function computeUnitPrice(input: UnitPriceInput): UnitPriceResult {
  const active = input.rules
    .filter(
      (rule) =>
        rule.customerLevel === input.customerLevel &&
        rule.minQty <= input.quantity &&
        rule.effectiveFrom <= input.now &&
        (rule.effectiveTo === null || rule.effectiveTo >= input.now),
    )
    .sort((a, b) => b.minQty - a.minQty || b.priority - a.priority);

  const tier = active[0];
  const tierPriceCents = tier?.unitPriceCents ?? input.listPriceCents;
  const bestDiscount = active
    .filter((rule) => rule.discountBps > 0)
    .sort((a, b) => b.priority - a.priority || b.discountBps - a.discountBps)[0];
  const finalPriceCents = bestDiscount
    ? Math.round((tierPriceCents * (10_000 - bestDiscount.discountBps)) / 10_000)
    : tierPriceCents;

  return {
    tierPriceCents,
    finalPriceCents,
    floorPriceCents: input.floorPriceCents,
    belowFloor: finalPriceCents < input.floorPriceCents,
    ruleRefs: active.map((rule) => rule.id),
  };
}

export interface TaxableLine {
  quantity: number;
  unitPriceCents: number;
  taxRateBps: number;
}

export function computeQuoteTotals(lines: TaxableLine[]) {
  const subtotalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  const taxTotalCents = Math.round(
    lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents * (line.taxRateBps / 10_000), 0),
  );
  return { subtotalCents, discountTotalCents: 0, taxTotalCents, totalCents: subtotalCents + taxTotalCents };
}
