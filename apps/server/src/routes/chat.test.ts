import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { MockProvider } from "../agent/mockProvider.js";
import { conversations, messages } from "../db/schema.js";
import { seedDatabase } from "../db/seed.js";
import { makeTestDb } from "../test/helpers.js";
import { registerChat } from "./chat.js";

describe("chat route", () => {
  it("streams a chat turn and persists the conversation", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const app = Fastify();
    registerChat(app, { db, sqlite, provider: new MockProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { "x-actor-id": "u_sales_lin" },
      payload: { message: "给华辰设计的张总报 120 台 X1" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: trace.start");
    expect(response.body).toContain("event: artifact");
    expect(response.body).toContain("event: token");
    expect(response.body).toContain("event: trace.end");
    expect(db.select().from(conversations).all()).toHaveLength(1);
    const rows = db.select().from(messages).all();
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.some((row) => row.role === "tool" && row.name)).toBe(true);
    expect(rows.some((row) => row.role === "assistant" && row.toolCallsJson)).toBe(true);
    await app.close();
  });

  it("replays tool calls and results in later turns", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const mock = new MockProvider();
    const seen: Array<{ messages: Array<{ role: string; content?: string | null; name?: string; tool_calls?: unknown }> }> = [];
    const provider = {
      name: "recording",
      chat(request: any) {
        seen.push({ messages: request.messages as Array<{ role: string; content?: string | null; name?: string; tool_calls?: unknown }> });
        return mock.chat(request);
      },
    };
    const app = Fastify();
    registerChat(app, { db, sqlite, provider: provider as any });

    const first = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { "x-actor-id": "u_sales_lin" },
      payload: { conversationId: "conv_context", message: "给华辰设计的张总报 120 台 X1" },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { "x-actor-id": "u_sales_lin" },
      payload: { conversationId: "conv_context", message: "确认，继续" },
    });
    expect(second.statusCode).toBe(200);
    const secondTurn = seen.find((entry) =>
      entry.messages.some((message) => message.role === "user" && message.content === "确认，继续"),
    );
    expect(secondTurn).toBeTruthy();
    expect(secondTurn!.messages.some((message) => message.role === "tool")).toBe(true);
    expect(secondTurn!.messages.some((message) => message.role === "assistant" && message.tool_calls)).toBe(true);
    await app.close();
  });

  it("rejects an unknown actor", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const app = Fastify();
    registerChat(app, { db, sqlite, provider: new MockProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { "x-actor-id": "u_missing" },
      payload: { message: "你好" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    await app.close();
  });

  it("rejects an invalid body", async () => {
    const { db, sqlite } = makeTestDb();
    seedDatabase(db);
    const app = Fastify();
    registerChat(app, { db, sqlite, provider: new MockProvider() });
    const response = await app.inject({ method: "POST", url: "/api/chat", payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    await app.close();
  });
});
