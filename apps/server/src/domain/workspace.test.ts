import { describe, expect, it } from "vitest";
import type { Actor } from "@salespilot/shared";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { approvals } from "../db/schema.js";
import { buildCustomerAssessment, buildOpportunityDetail, buildWorkspace, listOpportunityViews } from "./workspace.js";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };
const manager: Actor = { id: "u_manager_wang", name: "老王", role: "manager", teamId: "team_east" };

function setup(actor: Actor = sales) {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return { db, sqlite, actor };
}

describe("workspace service", () => {
  it("puts 华辰服务器采购 first for the sales rep", () => {
    const { db, actor } = setup();
    const workspace = buildWorkspace(db, actor);
    expect(workspace.scope).toBe("self");
    expect(workspace.priorities[0].customerName).toBe("华辰设计");
    expect(workspace.priorities[0].name).toBe("服务器采购");
    expect(workspace.priorities[0].priority).toBe("P0");
    expect(workspace.priorities[0].reasons.length).toBeGreaterThan(0);
    expect(workspace.metrics.activeOpportunities).toBeGreaterThanOrEqual(8);
    expect(workspace.metrics.highRiskOpportunities).toBeGreaterThan(0);
  });

  it("returns team metrics and ranking for a manager", () => {
    const { db, actor } = setup(manager);
    const workspace = buildWorkspace(db, actor);
    expect(workspace.scope).toBe("team");
    expect(workspace.ranking?.length).toBeGreaterThanOrEqual(3);
    expect(workspace.ranking?.[0].monthSalesCents).toBeGreaterThan(0);
    expect(workspace.metrics.pendingApprovals).toBeGreaterThanOrEqual(0);
  });

  it("builds a customer assessment with signals", () => {
    const { db, actor } = setup();
    const assessment = buildCustomerAssessment(db, actor, "c_huachen");
    expect(assessment.summary).toBeTruthy();
    expect(assessment.risks.length).toBeGreaterThan(0);
    expect(assessment.suggestion).toContain("备货");
    expect(assessment.nextAction).toContain("预算");
  });

  it("returns opportunity detail and enforces scope", () => {
    const { db, actor } = setup();
    const detail = buildOpportunityDetail(db, actor, "o_huachen_server");
    expect(detail.opportunity.id).toBe("o_huachen_server");
    expect(detail.priority.priority).toBe("P0");
    expect(detail.followUps.length).toBeGreaterThan(0);
    expect(detail.followUps.some((row) => row.id === "f_huachen_storage_1")).toBe(false);
    expect(() => buildOpportunityDetail(db, actor, "o_zhihang_server")).toThrow();
  });

  it("lists opportunities with filters", () => {
    const { db, actor } = setup();
    const all = listOpportunityViews(db, actor, {});
    expect(all.length).toBe(8);
    const quoteStage = listOpportunityViews(db, actor, { stage: "quote" });
    expect(quoteStage.every((row) => row.stage === "quote")).toBe(true);
  });

  it("links sales approval todos to the quote and manager todos to the queue", () => {
    const { db } = setup();
    db.insert(approvals).values({
      id: "ap_test",
      type: "order_conversion",
      targetType: "quote",
      targetId: "q_seed_1",
      requesterId: "u_sales_lin",
      approverId: null,
      status: "pending",
      reason: "测试审批",
      comment: null,
      payloadJson: "{}",
      createdAt: Date.now(),
      decidedAt: null,
    }).run();
    expect(buildWorkspace(db, sales).todos.approvals[0].href).toBe("/quotes/q_seed_1");
    expect(buildWorkspace(db, manager).todos.approvals[0].href).toBe("/approvals");
  });
});
