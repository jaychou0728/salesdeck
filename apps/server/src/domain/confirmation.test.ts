import { describe, expect, it } from "vitest";
import { AppError } from "@salespilot/shared";
import { makeTestDb } from "../test/helpers.js";
import { consumeConfirmationToken, issueConfirmationToken } from "./confirmation.js";
import { withIdempotency } from "./idempotency.js";

function expectAppErrorCode(fn: () => void, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected AppError ${code}`);
}

describe("confirmation tokens", () => {
  it("consumes a token exactly once", () => {
    const { db } = makeTestDb();
    const payload = { customerId: "c_huachen", lines: [{ sku: "X1", quantity: 120 }] };
    const { token } = issueConfirmationToken(db, { actorId: "u_sales_lin", toolName: "create_quote", payload });
    consumeConfirmationToken(db, token, { actorId: "u_sales_lin", toolName: "create_quote", payload });
    expectAppErrorCode(
      () => consumeConfirmationToken(db, token, { actorId: "u_sales_lin", toolName: "create_quote", payload }),
      "TOKEN_EXPIRED",
    );
  });

  it("rejects a token for another actor", () => {
    const { db } = makeTestDb();
    const payload = { quoteId: "q_1" };
    const { token } = issueConfirmationToken(db, { actorId: "u_sales_lin", toolName: "convert_quote_to_order", payload });
    expectAppErrorCode(
      () => consumeConfirmationToken(db, token, { actorId: "u_other", toolName: "convert_quote_to_order", payload }),
      "TOKEN_EXPIRED",
    );
  });

  it("rejects an expired token", () => {
    const { db } = makeTestDb();
    const payload = { quoteId: "q_1" };
    const { token } = issueConfirmationToken(db, { actorId: "u_sales_lin", toolName: "convert_quote_to_order", payload, ttlMs: 1 });
    expectAppErrorCode(
      () => consumeConfirmationToken(db, token, { actorId: "u_sales_lin", toolName: "convert_quote_to_order", payload, now: Date.now() + 10 }),
      "TOKEN_EXPIRED",
    );
  });

  it("rejects a token issued for a different tool", () => {
    const { db } = makeTestDb();
    const payload = { quoteId: "q_1" };
    const { token } = issueConfirmationToken(db, { actorId: "u_sales_lin", toolName: "create_quote", payload });
    expectAppErrorCode(
      () => consumeConfirmationToken(db, token, { actorId: "u_sales_lin", toolName: "convert_quote_to_order", payload }),
      "TOKEN_EXPIRED",
    );
  });

  it("rejects a token consumed with a different payload", () => {
    const { db } = makeTestDb();
    const payloadA = { quoteId: "q_1" };
    const payloadB = { quoteId: "q_2" };
    const { token } = issueConfirmationToken(db, { actorId: "u_sales_lin", toolName: "convert_quote_to_order", payload: payloadA });
    expectAppErrorCode(
      () => consumeConfirmationToken(db, token, { actorId: "u_sales_lin", toolName: "convert_quote_to_order", payload: payloadB }),
      "TOKEN_EXPIRED",
    );
  });

  it("rejects a token with a tampered signature", () => {
    const { db } = makeTestDb();
    const payload = { quoteId: "q_1" };
    const { token } = issueConfirmationToken(db, { actorId: "u_sales_lin", toolName: "convert_quote_to_order", payload });
    const [id, expiresAt, signature] = token.split(".");
    const flippedFirst = signature[0] === "0" ? "1" : "0";
    const tampered = `${id}.${expiresAt}.${flippedFirst}${signature.slice(1)}`;
    expectAppErrorCode(
      () => consumeConfirmationToken(db, tampered, { actorId: "u_sales_lin", toolName: "convert_quote_to_order", payload }),
      "TOKEN_EXPIRED",
    );
  });
});

describe("idempotency", () => {
  it("returns the first result on replay", () => {
    const { db } = makeTestDb();
    const first = withIdempotency(db, { key: "idem-1", actorId: "u_sales_lin", toolName: "create_quote", request: { a: 1 } }, () => ({ quoteId: "q_1" }));
    const second = withIdempotency(db, { key: "idem-1", actorId: "u_sales_lin", toolName: "create_quote", request: { a: 1 } }, () => ({ quoteId: "q_2" }));
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.value).toEqual({ quoteId: "q_1" });
  });

  it("throws CONFLICT when the same key is reused with a different request", () => {
    const { db } = makeTestDb();
    withIdempotency(
      db,
      { key: "idem-conflict", actorId: "u_sales_lin", toolName: "create_quote", request: { a: 1 } },
      () => ({ quoteId: "q_1" }),
    );
    expectAppErrorCode(
      () =>
        withIdempotency(
          db,
          { key: "idem-conflict", actorId: "u_sales_lin", toolName: "create_quote", request: { a: 2 } },
          () => ({ quoteId: "q_2" }),
        ),
      "CONFLICT",
    );
  });

  it("does not call fn again on replay", () => {
    const { db } = makeTestDb();
    let counter = 0;
    const fn = () => {
      counter += 1;
      return { quoteId: `q_${counter}` };
    };
    const first = withIdempotency(
      db,
      { key: "idem-replay", actorId: "u_sales_lin", toolName: "create_quote", request: { a: 1 } },
      fn,
    );
    const second = withIdempotency(
      db,
      { key: "idem-replay", actorId: "u_sales_lin", toolName: "create_quote", request: { a: 1 } },
      fn,
    );
    expect(counter).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.value).toEqual({ quoteId: "q_1" });
  });
});
