import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { executeTool, readTools } from "./index.js";
import type { Actor, TraceEvent } from "@salesdeck/shared";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };

function ctx(actor: Actor) {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  const events: TraceEvent[] = [];
  return { db, sqlite, actor, traceId: "t_test", emit: (event: TraceEvent) => events.push(event), events };
}

describe("read tools", () => {
  it("finds customers within the actor's scope", async () => {
    const c = ctx(sales);
    const result = await executeTool(readTools.find((t) => t.name === "search_customers")!, c, { query: "华辰" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) expect((result.model.data as any).customers[0].id).toBe("c_huachen");
  });

  it("returns a split inventory plan", async () => {
    const c = ctx(sales);
    const result = await executeTool(readTools.find((t) => t.name === "check_inventory")!, c, { skuQuery: "X1", quantity: 120 });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) {
      expect((result.model.data as any).canFulfill).toBe(true);
      expect((result.model.data as any).allocations.length).toBeGreaterThan(0);
    }
  });

  it("rejects cross-owner customer access", async () => {
    const c = ctx(sales);
    const other: Actor = { ...sales, id: "u_other" };
    const result = await executeTool(readTools.find((t) => t.name === "get_customer_360")!, { ...c, actor: other }, { customerId: "c_huachen" });
    expect(result.model.ok).toBe(false);
    if (!result.model.ok) expect(result.model.error.code).toBe("FORBIDDEN");
  });

  it("computes tier pricing for 120 X1", async () => {
    const c = ctx(sales);
    const result = await executeTool(readTools.find((t) => t.name === "get_pricing")!, c, { customerId: "c_huachen", items: [{ sku: "X1", quantity: 120 }] });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) expect((result.model.data as any).lines[0].finalPriceCents).toBe(724_680);
  });

  it("finds customers by contact name and marks ambiguity", async () => {
    const c = ctx(sales);
    const result = await executeTool(readTools.find((t) => t.name === "search_customers")!, c, { query: "张总" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) {
      expect((result.model.data as any).customers).toHaveLength(2);
      expect((result.model.data as any).ambiguous).toBe(true);
    }
  });

  it("honors region and needByDate filters", async () => {
    const c = ctx(sales);
    const region = await executeTool(readTools.find((t) => t.name === "check_inventory")!, c, { skuQuery: "X1", quantity: 120, region: "苏州" });
    expect(region.model.ok).toBe(true);
    if (region.model.ok) {
      expect((region.model.data as any).allocations.every((a: any) => a.warehouseId === "w_sz")).toBe(true);
    }

    const today = new Date().toISOString().slice(0, 10);
    const byDate = await executeTool(readTools.find((t) => t.name === "check_inventory")!, c, { skuQuery: "X1", quantity: 120, needByDate: today });
    expect(byDate.model.ok).toBe(true);
    if (byDate.model.ok) expect((byDate.model.data as any).canFulfill).toBe(false);
  });
});
