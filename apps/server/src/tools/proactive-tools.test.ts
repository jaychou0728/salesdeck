import { describe, expect, it } from "vitest";
import type { Actor } from "@salespilot/shared";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { allTools, executeTool } from "./index.js";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };

function ctx(actor: Actor) {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return { db, sqlite, actor, traceId: "t_proactive", emit: () => {} };
}

const tool = (name: string) => allTools.find((item) => item.name === name)!;

describe("proactive read tools", () => {
  it("returns priorities for the sales rep", async () => {
    const result = await executeTool(tool("get_sales_priorities"), ctx(sales), { scope: "self" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) {
      const data = result.model.data as any;
      expect(data.priorities[0].customerName).toBe("华辰设计");
      expect(data.metrics.activeOpportunities).toBeGreaterThan(0);
    }
  });

  it("blocks team scope for sales", async () => {
    const result = await executeTool(tool("get_sales_priorities"), ctx(sales), { scope: "team" });
    expect(result.model.ok).toBe(false);
    if (!result.model.ok) expect(result.model.error.code).toBe("FORBIDDEN");
  });

  it("returns opportunity detail", async () => {
    const result = await executeTool(tool("get_opportunity_detail"), ctx(sales), { opportunityId: "o_huachen_server" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) {
      const data = result.model.data as any;
      expect(data.opportunity.id).toBe("o_huachen_server");
      expect(data.followUps.length).toBeGreaterThan(0);
    }
  });

  it("includes opportunities in customer 360", async () => {
    const result = await executeTool(tool("get_customer_360"), ctx(sales), { customerId: "c_huachen" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) {
      const data = result.model.data as any;
      expect(data.opportunities.length).toBeGreaterThan(0);
      expect(data.followUps.length).toBeGreaterThan(0);
    }
  });

  it("emits structured action suggestions", async () => {
    const c = ctx(sales);
    const events: any[] = [];
    const result = await executeTool(tool("suggest_actions"), { ...c, emit: (event: any) => events.push(event) }, {
      actions: [{ label: "记录跟进", prompt: "记录跟进：已联系客户" }],
    });
    expect(result.model.ok).toBe(true);
    const artifact = events.find((event) => event.type === "artifact");
    expect(artifact.payload.kind).toBe("actions");
    expect(artifact.payload.payload.actions[0].label).toBe("记录跟进");
  });
});

describe("proactive write tools", () => {
  it("previews and commits a follow-up with confirmation", async () => {
    const c = ctx(sales);
    const events: any[] = [];
    const toolCtx = { ...c, emit: (event: any) => events.push(event) };
    const nextActionDueAt = Date.now() + 3 * 86_400_000;
    const preview = await executeTool(tool("log_follow_up"), toolCtx, {
      customerId: "c_huachen",
      opportunityId: "o_huachen_server",
      type: "call",
      content: "已联系采购，预算本周确认",
      result: "客户周五答复",
      nextAction: "周五再次联系采购",
      nextActionDueAt,
      dryRun: true,
    });
    expect(preview.model.ok).toBe(true);
    if (preview.model.ok) expect((preview.model.data as any).status).toBe("pending_confirmation");
    const artifact = events.find((event) => event.type === "artifact");
    expect(artifact.payload.kind).toBe("follow_up");
    const committed = await executeTool(tool("log_follow_up"), toolCtx, {
      customerId: "c_huachen",
      opportunityId: "o_huachen_server",
      type: "call",
      content: "已联系采购，预算本周确认",
      result: "客户周五答复",
      nextAction: "周五再次联系采购",
      nextActionDueAt,
      dryRun: false,
      confirmationToken: artifact.payload.confirmationToken,
      idempotencyKey: "idem-follow-up-1",
    });
    expect(committed.model.ok).toBe(true);
    if (committed.model.ok) expect((committed.model.data as any).status).toBe("committed");
  });

  it("previews and commits a next-action update", async () => {
    const c = ctx(sales);
    const events: any[] = [];
    const toolCtx = { ...c, emit: (event: any) => events.push(event) };
    const nextActionDueAt = Date.now() + 2 * 86_400_000;
    const preview = await executeTool(tool("update_opportunity_next_action"), toolCtx, {
      opportunityId: "o_huachen_server",
      nextAction: "周五确认预算",
      nextActionDueAt,
      dryRun: true,
    });
    expect(preview.model.ok).toBe(true);
    const artifact = events.find((event) => event.type === "artifact");
    expect(artifact.payload.kind).toBe("next_action");
    const committed = await executeTool(tool("update_opportunity_next_action"), toolCtx, {
      opportunityId: "o_huachen_server",
      nextAction: "周五确认预算",
      nextActionDueAt,
      dryRun: false,
      confirmationToken: artifact.payload.confirmationToken,
      idempotencyKey: "idem-next-action-1",
    });
    expect(committed.model.ok).toBe(true);
    if (committed.model.ok) expect((committed.model.data as any).status).toBe("committed");
  });

  it("blocks cross-owner writes", async () => {
    const result = await executeTool(tool("update_opportunity_next_action"), ctx(sales), {
      opportunityId: "o_zhihang_server",
      nextAction: "越权",
      dryRun: true,
    });
    expect(result.model.ok).toBe(false);
    if (!result.model.ok) expect(result.model.error.code).toBe("FORBIDDEN");
  });
});
