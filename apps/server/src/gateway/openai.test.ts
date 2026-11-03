import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { MockProvider } from "../agent/mockProvider.js";
import { registerOpenAiGateway } from "./openai.js";

describe("openai-compatible gateway", () => {
  it("passes tools through and returns tool_calls", async () => {
    const app = Fastify();
    registerOpenAiGateway(app, new MockProvider());
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "mock",
        messages: [{ role: "user", content: "给华辰设计报价 120 台 X1" }],
        tools: [{ type: "function", function: { name: "search_customers", description: "search", parameters: { type: "object" } } }],
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.choices[0].finish_reason).toBe("tool_calls");
    expect(body.choices[0].message.tool_calls[0].function.name).toBe("search_customers");
  });

  it("streams SSE chunks", async () => {
    const app = Fastify();
    registerOpenAiGateway(app, new MockProvider());
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { accept: "text/event-stream" },
      payload: { model: "mock", stream: true, messages: [{ role: "user", content: "晨报" }] },
    });
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("data:");
    expect(response.body).toContain("[DONE]");
  });
});
