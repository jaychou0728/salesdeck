import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { ingestKnowledge } from "../rag/ingest.js";
import { MockProvider } from "./mockProvider.js";
import { buildAgentGraph } from "./graph.js";
import { textResponse, type ChatProvider, type ChatResponse } from "./provider.js";
import { quotes } from "../db/schema.js";
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

  it("blocks model-initiated commits without a user confirmation", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const events: any[] = [];
    const ctx = { db, sqlite, actor, traceId: "t_commit_guard", emit: (event: any) => events.push(event) };
    const firstCall = toolCallProvider(
      "create_quote",
      JSON.stringify({
        customerId: "c_huachen",
        contactId: "ct_zhang_1",
        lines: [{ sku: "X1", quantity: 2 }],
        dryRun: false,
      }),
    );
    let calls = 0;
    const provider: ChatProvider = {
      name: "guard-test",
      async chat(request) {
        calls += 1;
        if (calls === 1) return firstCall.chat(request);
        return textResponse("已生成预览，请用户确认。", "test");
      },
    };
    const graph = buildAgentGraph({ provider, ctx, allTools });
    const result = await graph.invoke({
      messages: [{ role: "user", content: "直接给华辰设计下单" }],
      actor,
      traceId: "t_commit_guard",
      intent: "business",
      stepCount: 0,
      pendingConfirmation: false,
      citations: [],
      toolCalls: [],
    });
    const toolResult = [...(result.messages as any[])].reverse().find((message) => message.role === "tool");
    expect(toolResult?.content).toContain("模型只能生成预览");
    expect(db.select().from(quotes).all()).toHaveLength(7);
    expect(result.pendingConfirmation).toBe(false);
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
    expect(result.finalText).toContain("多个业务步骤");
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

  it("promotes a customer through proactive tools", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const events: any[] = [];
    const ctx = { db, sqlite, actor, traceId: "t_promote", emit: (event: any) => events.push(event) };
    const graph = buildAgentGraph({ provider: new MockProvider(), ctx, allTools });
    await graph.invoke({
      messages: [{ role: "user", content: "帮我推进华辰设计" }],
      actor,
      traceId: "t_promote",
      intent: "business",
      stepCount: 0,
      pendingConfirmation: false,
      citations: [],
      toolCalls: [],
      toolCounts: {},
      budgetExceeded: false,
      finalText: "",
    });
    const toolNames = events.filter((event) => event.type === "step.start").map((event) => event.name);
    expect(toolNames).toContain("get_opportunity_detail");
    expect(toolNames).toContain("check_inventory");
  });
});
