import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Actor } from "@salespilot/shared";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { opportunities } from "../db/schema.js";
import { recordFollowUp, updateOpportunity } from "./followUps.js";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return { db, sqlite, actor: sales };
}

describe("follow-up domain", () => {
  it("records a follow-up and moves the opportunity next action", () => {
    const { db, actor } = setup();
    const result = recordFollowUp(db, actor, {
      customerId: "c_huachen",
      opportunityId: "o_huachen_server",
      type: "call",
      content: "已联系采购，预算本周确认",
      result: "客户确认本周五给答复",
      nextAction: "周五再次联系采购",
      nextActionDueAt: Date.now() + 3 * 86_400_000,
    });
    expect(result.followUp.id).toBeTruthy();
    const row = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
    expect(row?.nextAction).toBe("周五再次联系采购");
    expect(row?.lastFollowUpAt).toBeGreaterThan(0);
  });

  it("rejects a follow-up for another sales rep's customer", () => {
    const { db, actor } = setup();
    expect(() =>
      recordFollowUp(db, actor, {
        customerId: "c_zhihang",
        type: "call",
        content: "越权跟进",
      }),
    ).toThrow();
  });

  it("updates opportunity stage and next action", () => {
    const { db, actor } = setup();
    updateOpportunity(db, actor, "o_huachen_server", {
      stage: "negotiation",
      probability: 80,
      nextAction: "确认合同条款",
    });
    const row = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
    expect(row?.stage).toBe("negotiation");
    expect(row?.probability).toBe(80);
  });

  it("allows a manager to update a team opportunity", () => {
    const { db } = setup();
    const manager: Actor = { id: "u_manager_wang", name: "老王", role: "manager", teamId: "team_east" };
    updateOpportunity(db, manager, "o_zhihang_server", { riskLevel: "medium" });
    const row = db.select().from(opportunities).where(eq(opportunities.id, "o_zhihang_server")).get();
    expect(row?.riskLevel).toBe("medium");
  });
});
