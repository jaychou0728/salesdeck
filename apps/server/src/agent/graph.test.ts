import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { ingestKnowledge } from "../rag/ingest.js";
import { MockProvider } from "./mockProvider.js";
import { buildAgentGraph } from "./graph.js";
import type { ChatProvider, ChatResponse } from "./provider.js";
import { allTools } from "../tools/index.js";

function toolCallProvider(name: string, args: string): ChatProvider {
  return {
    name: "inline",
    async chat(): Promise<ChatResponse> {
      return {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Date.now(),
        model: "test",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: `call_${Math.random().toString(36).slice(2)}`,
                  type: "function",
                  function: { name, arguments: args },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    },
  };
}

const actor = { id: "u_sales_lin", name: "小林", role: "sales" as const, teamId: "team_east" };

describe("agent graph", () => {
  it("runs a multi-tool quote flow and emits artifacts", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
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

  it("handles malformed tool arguments without throwing", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const events: any[] = [];
    const ctx = { db, sqlite, actor, traceId: "t_malformed", emit: (event: any) => events.push(event) };
    const graph = buildAgentGraph({ provider: toolCallProvider("get_customer_360", "{not json"), ctx, allTools });
    const result = await graph.invoke({
      messages: [{ role: "user", content: "查一下华辰设计的情况" }],
      actor,
      traceId: "t_malformed",
      intent: "business",
      stepCount: 0,
      pendingConfirmation: false,
      citations: [],
      toolCalls: [],
    });
    expect(result.finalText).toBeTruthy();
    expect(events.some((event) => event.type === "token")).toBe(true);
  });

  it("stops after the per-tool budget is exceeded", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const events: any[] = [];
    const ctx = { db, sqlite, actor, traceId: "t_budget", emit: (event: any) => events.push(event) };
    const graph = buildAgentGraph({
      provider: toolCallProvider("get_customer_360", JSON.stringify({ customerId: "c_huachen" })),
      ctx,
      allTools,
    });
    const result = await graph.invoke({
      messages: [{ role: "user", content: "查一下华辰设计的情况" }],
      actor,
      traceId: "t_budget",
      intent: "business",
      stepCount: 0,
      pendingConfirmation: false,
      citations: [],
      toolCalls: [],
    });
    expect(result.stepCount).toBeLessThanOrEqual(8);
    expect(result.finalText).toBeTruthy();
    expect(result.finalText).toContain("超出限制");
  });

  it("retrieves policy evidence with citations and a retrieval step", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    ingestKnowledge(db, path.resolve(import.meta.dirname, "../../../../knowledge"));
    const events: any[] = [];
    const ctx = { db, sqlite, actor, traceId: "t_policy", emit: (event: any) => events.push(event) };
    const graph = buildAgentGraph({ provider: new MockProvider(), ctx, allTools });
    const result = await graph.invoke({
      messages: [{ role: "user", content: "华辰那台开不了机怎么处理？" }],
      actor,
      traceId: "t_policy",
      intent: "policy",
      stepCount: 0,
      pendingConfirmation: false,
      citations: [],
      toolCalls: [],
    });
    const stepNames = events.filter((event) => event.type === "step.end").map((event) => event.name);
    expect(stepNames).toContain("search_knowledge");
    expect(stepNames).toContain("retrieval");
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.finalText).toBeTruthy();
  });
});
