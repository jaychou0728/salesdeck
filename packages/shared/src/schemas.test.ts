import { describe, expect, it } from "vitest";
import {
  CreateQuoteInput,
  GetSalesBriefingInput,
  moneyCents,
} from "./schemas.js";

describe("shared schemas", () => {
  it("accepts a dry-run quote", () => {
    const parsed = CreateQuoteInput.parse({
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: true,
    });
    expect(parsed.validDays).toBe(7);
  });

  it("rejects commit without token and idempotency key", () => {
    expect(() =>
      CreateQuoteInput.parse({
        customerId: "c_huachen",
        contactId: "ct_zhang_1",
        lines: [{ sku: "X1", quantity: 120 }],
        dryRun: false,
      }),
    ).toThrow(/confirmationToken/);
  });

  it("rejects negative money", () => {
    expect(() => moneyCents.parse(-1)).toThrow();
  });

  it("limits briefing scope to self or team", () => {
    expect(GetSalesBriefingInput.parse({ scope: "team" }).scope).toBe("team");
    expect(() => GetSalesBriefingInput.parse({ scope: "all" })).toThrow();
  });
});
