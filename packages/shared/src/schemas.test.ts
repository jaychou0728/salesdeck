import { describe, expect, it } from "vitest";
import {
  ConfirmRequest,
  ConvertQuoteToOrderInput,
  CreateAfterSalesTicketInput,
  CreateQuoteInput,
  GetSalesPrioritiesInput,
  GetSalesBriefingInput,
  LogFollowUpInput,
  UpdateOpportunityNextActionInput,
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
    ).toThrow(/前端确认/);
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

describe("proactive sales contracts", () => {
  it("parses priority scope and defaults", () => {
    const parsed = GetSalesPrioritiesInput.parse({ scope: "self" });
    expect(parsed.limit).toBe(5);
    expect(parsed.focus).toBe("all");
  });

  it("rejects a follow-up commit without token and idempotency key", () => {
    const result = LogFollowUpInput.safeParse({
      customerId: "c_huachen",
      type: "call",
      content: "确认预算",
      dryRun: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts the two new confirmation tool names", () => {
    for (const toolName of ["log_follow_up", "update_opportunity_next_action"]) {
      const result = ConfirmRequest.safeParse({
        token: "1234567890",
        toolName,
        payload: {},
        idempotencyKey: "idem-123456",
      });
      expect(result.success).toBe(true);
    }
  });

  it("requires credentials for a next-action commit", () => {
    expect(
      UpdateOpportunityNextActionInput.safeParse({
        opportunityId: "o_test",
        nextAction: "周五确认预算",
        dryRun: false,
      }).success,
    ).toBe(false);

    expect(
      UpdateOpportunityNextActionInput.safeParse({
        opportunityId: "o_test",
        nextAction: "周五确认预算",
        dryRun: false,
        confirmationToken: "1234567890",
        idempotencyKey: "idem-123456",
      }).success,
    ).toBe(true);
  });

  it("accepts a follow-up commit with credentials", () => {
    const result = LogFollowUpInput.safeParse({
      customerId: "c_huachen",
      type: "call",
      content: "确认预算",
      dryRun: false,
      confirmationToken: "1234567890",
      idempotencyKey: "idem-123456",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a dry-run follow-up without credentials", () => {
    const result = LogFollowUpInput.safeParse({
      customerId: "c_huachen",
      type: "call",
      content: "确认预算",
      dryRun: true,
    });
    expect(result.success).toBe(true);
  });

  it("preserves opportunityId on quote input", () => {
    const parsed = CreateQuoteInput.parse({
      customerId: "c_huachen",
      contactId: "ct_zhang_1",
      opportunityId: "o_test",
      lines: [{ sku: "X1", quantity: 120 }],
      dryRun: true,
    });
    expect(parsed.opportunityId).toBe("o_test");
  });

  it("rejects out-of-range priority limits and invalid focus", () => {
    expect(GetSalesPrioritiesInput.safeParse({ scope: "self", limit: 0 }).success).toBe(false);
    expect(GetSalesPrioritiesInput.safeParse({ scope: "self", limit: 11 }).success).toBe(false);
    expect(GetSalesPrioritiesInput.safeParse({ scope: "self", focus: "revenue" }).success).toBe(false);
  });
});
