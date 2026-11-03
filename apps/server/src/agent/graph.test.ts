import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { MockProvider } from "./mockProvider.js";
import { buildAgentGraph } from "./graph.js";
import { allTools } from "../tools/index.js";

describe("agent graph", () => {
  it("runs a multi-tool quote flow and emits artifacts", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const actor = { id: "u_sales_lin", name: "小林", role: "sales" as const, teamId: "team_east" };
    const events: any[] = [];
    const ctx = { db, sqlite, actor, traceId: "t_graph", emit: (event: any) => events.push(event) };
    const graph = buildAgentGraph({ provider: new MockProvider(), ctx, allTools });
    const result = await graph.invoke({
      messages: [{ role: "user", content: "给华辰设计的张总报 120 台 X1，月底前到货" }],
      actor,
      traceId: "t_graph",
      intent: "business",
      stepCount: 0,
      pendingConfirmation: false,
      citations: [],
      toolCalls: [],
    });
    const toolNames = events.filter((event) => event.type === "step.start").map((event) => event.name);
    expect(toolNames).toContain("create_quote");
    expect(events.some((event) => event.type === "artifact" && event.payload.kind === "quote")).toBe(true);
    expect(result.pendingConfirmation).toBe(true);
  });
});
