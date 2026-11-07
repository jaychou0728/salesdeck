import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { buildApp } from "../app.js";
import { MockProvider } from "../agent/mockProvider.js";
import { opportunities } from "../db/schema.js";

const as = (id: string) => ({ "x-actor-id": id });

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return { app: buildApp({ db, sqlite, provider: new MockProvider() }), db };
}

describe("follow-up routes", () => {
  it("records a follow-up and updates the opportunity", async () => {
    const { app, db } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/business/follow-ups",
      headers: as("u_sales_lin"),
      payload: {
        customerId: "c_huachen",
        opportunityId: "o_huachen_server",
        type: "call",
        content: "已联系采购，预算本周确认",
        result: "客户周五答复",
        nextAction: "周五再次联系采购",
        nextActionDueAt: Date.now() + 3 * 86_400_000,
      },
    });
    expect(response.statusCode).toBe(200);
    const row = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
    expect(row?.nextAction).toBe("周五再次联系采购");
  });

  it("rejects cross-owner follow-ups", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/business/follow-ups",
      headers: as("u_sales_lin"),
      payload: { customerId: "c_zhihang", type: "call", content: "越权" },
    });
    expect(response.statusCode).toBe(403);
  });
});
