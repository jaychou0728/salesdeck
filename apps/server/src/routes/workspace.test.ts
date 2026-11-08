import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { buildApp } from "../app.js";
import { MockProvider } from "../agent/mockProvider.js";

const as = (id: string) => ({ "x-actor-id": id });

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return buildApp({ db, sqlite, provider: new MockProvider() });
}

describe("workspace routes", () => {
  it("returns the sales war room", async () => {
    const app = setup();
    const response = await app.inject({ method: "GET", url: "/api/business/workspace", headers: as("u_sales_lin") });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.scope).toBe("self");
    expect(body.priorities[0].customerName).toBe("华辰设计");
    expect(body.metrics.monthSalesCents).toBeGreaterThan(0);
    expect(body.todos).toBeTruthy();
  });

  it("returns team metrics and ranking for managers", async () => {
    const app = setup();
    const response = await app.inject({ method: "GET", url: "/api/business/workspace", headers: as("u_manager_wang") });
    const body = response.json();
    expect(body.scope).toBe("team");
    expect(body.ranking.length).toBeGreaterThanOrEqual(3);
  });

  it("lists and updates opportunities with scope checks", async () => {
    const app = setup();
    const list = await app.inject({ method: "GET", url: "/api/business/opportunities", headers: as("u_sales_lin") });
    expect(list.statusCode).toBe(200);
    expect(list.json().opportunities.some((row: { id: string }) => row.id === "o_huachen_server")).toBe(true);
    expect(list.json().opportunities.some((row: { id: string }) => row.id === "o_zhihang_server")).toBe(false);

    const forbidden = await app.inject({
      method: "PATCH",
      url: "/api/business/opportunities/o_zhihang_server",
      headers: as("u_sales_lin"),
      payload: { nextAction: "越权" },
    });
    expect(forbidden.statusCode).toBe(403);

    const updated = await app.inject({
      method: "PATCH",
      url: "/api/business/opportunities/o_huachen_server",
      headers: as("u_sales_lin"),
      payload: { nextAction: "周五确认预算", probability: 75 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().opportunity.nextAction).toBe("周五确认预算");
  });

  it("creates opportunities for scoped customers", async () => {
    const app = setup();
    const created = await app.inject({
      method: "POST",
      url: "/api/business/opportunities",
      headers: as("u_sales_lin"),
      payload: {
        customerId: "c_huachen",
        name: "测试商机",
        amountCents: 1_000_000,
        stage: "lead",
        probability: 10,
        expectedCloseDate: Date.now() + 7 * 86_400_000,
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().opportunity.name).toBe("测试商机");

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/business/opportunities",
      headers: as("u_sales_lin"),
      payload: {
        customerId: "c_zhihang",
        name: "越权商机",
        amountCents: 1_000_000,
        stage: "lead",
        probability: 10,
        expectedCloseDate: Date.now() + 7 * 86_400_000,
      },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
