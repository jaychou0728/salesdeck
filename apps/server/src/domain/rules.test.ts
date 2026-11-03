import { AppError, type ErrorCode } from "@salespilot/shared";
import { describe, expect, it } from "vitest";
import { checkCredit } from "./credit.js";
import { assertOrderTransition, assertQuoteTransition, assertQuoteConvertible } from "./state.js";
import { assertCustomerAccess } from "./permissions.js";

function expectAppError(fn: () => unknown, code: ErrorCode, message?: RegExp) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.code).toBe(code);
    if (message) expect(appError.message).toMatch(message);
    return;
  }
  throw new Error(`expected AppError ${code} but nothing was thrown`);
}

describe("business rules", () => {
  it("requires approval when credit is exceeded", () => {
    const result = checkCredit({ creditLimitCents: 5_000_000, creditUsedCents: 4_600_000 }, 500_000);
    expect(result.requiresApproval).toBe(true);
    expect(result.availableCents).toBe(400_000);
  });

  it("rejects invalid quote transitions", () => {
    expectAppError(() => assertQuoteTransition("draft", "converted"), "INVALID_STATE");
    expect(() => assertQuoteTransition("pending_approval", "approved")).not.toThrow();
  });

  it("rejects expired quotes", () => {
    expectAppError(() => assertQuoteConvertible({ status: "approved", validUntil: 100 }, 200), "INVALID_STATE", /过期/);
  });

  it("enforces order transitions", () => {
    expect(() => assertOrderTransition("reserved", "fulfilled")).not.toThrow();
    expectAppError(() => assertOrderTransition("fulfilled", "reserved"), "INVALID_STATE");
  });

  it("blocks sales from another owner's customer", () => {
    expectAppError(
      () => assertCustomerAccess({ id: "u_other", role: "sales", teamId: "team_east", name: "其他" }, { ownerId: "u_sales_lin" }),
      "FORBIDDEN",
    );
    expect(() =>
      assertCustomerAccess({ id: "u_manager_wang", role: "manager", teamId: "team_east", name: "老王" }, { ownerId: "u_sales_lin" }),
    ).not.toThrow();
  });
});
