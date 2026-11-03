import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ChatRequest } from "@salespilot/shared";
import type { ChatProvider } from "../agent/provider.js";
import { buildAgentGraph } from "../agent/graph.js";
import { TraceRecorder } from "../agent/trace.js";
import { openSse } from "../gateway/sse.js";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";
import { allTools } from "../tools/index.js";

export function registerChat(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database; provider: ChatProvider }) {
  app.post("/api/chat", async (request, reply) => {
    const body = ChatRequest.parse(request.body);
    const actorId = body.actorId ?? (request.headers["x-actor-id"] as string | undefined) ?? "u_sales_lin";
    const actorRow = deps.db.select().from(users).where(eq(users.id, actorId)).get();
    const actor = actorRow ?? { id: "u_sales_lin", name: "小林", role: "sales" as const, teamId: "team_east" };
    const conversationId = body.conversationId ?? `conv_${randomUUID()}`;
    const sse = openSse(reply);
    const trace = new TraceRecorder(deps.db, actor.id, conversationId, (event) => sse.send(event.type, event));
    trace.start();
    const ctx = { db: deps.db, sqlite: deps.sqlite, actor, traceId: trace.traceId, emit: (event: any) => trace.event(event) };
    try {
      const graph = buildAgentGraph({ provider: deps.provider, ctx, allTools });
      const result = await graph.invoke({
        messages: [{ role: "user", content: body.message }],
        actor,
        traceId: trace.traceId,
        intent: "business",
        stepCount: 0,
        pendingConfirmation: false,
        citations: [],
        toolCalls: [],
      });
      trace.end("ok");
      sse.end();
      return reply;
    } catch (error) {
      trace.event({ type: "error", status: "error", payload: { message: error instanceof Error ? error.message : "unknown" } });
      trace.end("error");
      sse.end();
      return reply;
    }
  });
}
