import { describe, expect, it } from "vitest";
import { deriveRiskLevel, scoreOpportunity, type PriorityInput } from "./priority.js";

const now = new Date("2026-11-07T10:00:00+08:00").getTime();
const day = 86_400_000;

function input(overrides: Partial<PriorityInput> = {}): PriorityInput {
  return {
    opportunityId: "o_test",
    customerId: "c_test",
    customerName: "测试客户",
    ownerId: "u_sales_lin",
    ownerName: "小林",
    name: "测试商机",
    amountCents: 10_000_000,
    stage: "needs",
    probability: 50,
    riskLevel: "low",
    nextAction: "跟进",
    nextActionDueAt: now + 3 * day,
    lastFollowUpAt: now - day,
    createdAt: now - 10 * day,
    signals: {
      creditUtilization: 0.2,
      quoteExpiringAt: null,
      stockShortage: false,
      recentCustomerReply: false,
    },
    ...overrides,
  };
}

describe("priority engine", () => {
  it("puts a large idle high-risk quote opportunity at P0", () => {
    const item = scoreOpportunity(
      input({
        amountCents: 28_000_000,
        stage: "quote",
        probability: 70,
        riskLevel: "high",
        lastFollowUpAt: now - 5 * day,
        nextActionDueAt: now + 2 * 3_600_000,
        signals: {
          creditUtilization: 0.92,
          quoteExpiringAt: now + 36 * 3_600_000,
          stockShortage: true,
          recentCustomerReply: false,
        },
      }),
      now,
    );
    expect(item.priority).toBe("P0");
    expect(item.score).toBeGreaterThanOrEqual(60);
    expect(item.reasons.join(" ")).toContain("未跟进");
    expect(item.reasons.join(" ")).toContain("信用");
    expect(item.suggestedAction).toContain("备货");
  });

  it("marks a recently replied opportunity as P1", () => {
    const item = scoreOpportunity(
      input({
        amountCents: 12_000_000,
        stage: "negotiation",
        probability: 65,
        lastFollowUpAt: now - 2 * 3_600_000,
        nextActionDueAt: now + 2 * 3_600_000,
        signals: {
          creditUtilization: 0.2,
          quoteExpiringAt: null,
          stockShortage: false,
          recentCustomerReply: true,
        },
      }),
      now,
    );
    expect(item.priority).toBe("P1");
    expect(item.reasons.join(" ")).toContain("回复");
    expect(item.suggestedAction).toContain("下一版");
  });

  it("keeps a small early-stage opportunity at P2", () => {
    const item = scoreOpportunity(
      input({
        amountCents: 6_000_000,
        stage: "needs",
        probability: 30,
        lastFollowUpAt: now - 3 * day,
        nextActionDueAt: now + 5 * day,
      }),
      now,
    );
    expect(item.priority).toBe("P2");
  });

  it("escalates risk from signals", () => {
    expect(deriveRiskLevel("low", { creditUtilization: 0.95, quoteExpiringAt: null, stockShortage: false })).toBe("high");
    expect(deriveRiskLevel("low", { creditUtilization: 0.82, quoteExpiringAt: null, stockShortage: false })).toBe("medium");
    expect(deriveRiskLevel("medium", { creditUtilization: 0.2, quoteExpiringAt: now + 3_600_000, stockShortage: false })).toBe("medium");
  });
});
