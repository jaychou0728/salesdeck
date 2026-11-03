import { describe, expect, it } from "vitest";
import {
  ConvertQuoteToOrderInput,
  CreateAfterSalesTicketInput,
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

  it("requires both token and idempotency key for every write schema", () => {
    const cases: Array<
      [string, { parse: (value: unknown) => unknown }, Record<string, unknown>]
    > = [
      [
        "CreateQuoteInput",
        CreateQuoteInput,
        {
          customerId: "c_huachen",
          contactId: "ct_zhang_1",
          lines: [{ sku: "X1", quantity: 120 }],
          dryRun: false,
        },
      ],
      [
        "ConvertQuoteToOrderInput",
        ConvertQuoteToOrderInput,
        { quoteId: "q_test", dryRun: false },
      ],
      [
        "CreateAfterSalesTicketInput",
        CreateAfterSalesTicketInput,
        {
          customerId: "c_huachen",
          productId: "p_x1",
          issueType: "DOA",
          description: "cannot boot",
          policyRefs: ["k1"],
          dryRun: false,
        },
      ],
    ];

    for (const [name, schema, base] of cases) {
      expect(
        () => schema.parse({ ...base, confirmationToken: "tok_abcdef12" }),
        `${name} should reject a token without an idempotency key`,
      ).toThrow();
      expect(
        () => schema.parse({ ...base, idempotencyKey: "idem_abcdef12" }),
        `${name} should reject a key without a confirmation token`,
      ).toThrow();
      expect(
        () =>
          schema.parse({
            ...base,
            confirmationToken: "tok_abcdef12",
            idempotencyKey: "idem_abcdef12",
          }),
        `${name} should accept both token and idempotency key`,
      ).not.toThrow();
    }
  });

  it("rejects negative money", () => {
    expect(() => moneyCents.parse(-1)).toThrow();
  });

  it("limits briefing scope to self or team", () => {
    expect(GetSalesBriefingInput.parse({ scope: "team" }).scope).toBe("team");
    expect(() => GetSalesBriefingInput.parse({ scope: "all" })).toThrow();
  });
});
