import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ChatRequest } from "@salespilot/shared";
import type { ChatMessage, ChatProvider } from "../agent/provider.js";
import { buildAgentGraph } from "../agent/graph.js";
import { TraceRecorder } from "../agent/trace.js";
import { openSse } from "../gateway/sse.js";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { conversations, messages, users } from "../db/schema.js";
import { allTools } from "../tools/index.js";

export function registerChat(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database; provider: ChatProvider }) {
  app.after(() => {
    app.post(
      "/api/chat",
      {
        attachValidation: true,
        schema: {
          tags: ["chat"],
          summary: "Stream agent trace, artifacts and answer over SSE",
          body: {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
              conversationId: { type: "string" },
              actorId: { type: "string" },
            },
          },
          response: {
            200: { type: "string", description: "text/event-stream" },
            400: { type: "object", additionalProperties: true },
            403: { type: "object", additionalProperties: true },
          },
        },
      },
      async (request, reply) => {
        const parsed = ChatRequest.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({
            ok: false,
            error: { code: "VALIDATION_ERROR", message: "请求参数不合法", details: parsed.error.issues },
          });
        }
        const body = parsed.data;

        const requestedActorId = body.actorId ?? (request.headers["x-actor-id"] as string | undefined);
        let actor: { id: string; name: string; role: "sales" | "manager"; teamId: string };
        if (requestedActorId) {
          const actorRow = deps.db.select().from(users).where(eq(users.id, requestedActorId)).get();
          if (!actorRow) {
            return reply.code(403).send({ ok: false, error: { code: "FORBIDDEN", message: "未知用户" } });
          }
          actor = actorRow;
        } else {
          const defaultRow = deps.db.select().from(users).where(eq(users.id, "u_sales_lin")).get();
          actor = defaultRow ?? { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };
        }

        const now = Date.now();
        const conversationId = body.conversationId ?? `conv_${randomUUID()}`;
        const existing = deps.db.select().from(conversations).where(eq(conversations.id, conversationId)).get();
        if (existing && existing.actorId !== actor.id) {
          return reply.code(403).send({ ok: false, error: { code: "FORBIDDEN", message: "无权访问该会话" } });
        }
        if (!existing) {
          deps.db
            .insert(conversations)
            .values({ id: conversationId, actorId: actor.id, title: body.message.slice(0, 30), createdAt: now, updatedAt: now })
            .run();
        }

        const priorRows = deps.db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(messages.createdAt)
          .all();
        const priorMessages: ChatMessage[] = priorRows.map((row) => ({
          role: row.role as ChatMessage["role"],
          content: row.content,
        }));
        deps.db
          .insert(messages)
          .values({ id: `msg_${randomUUID()}`, conversationId, role: "user", content: body.message, createdAt: Date.now() })
          .run();

        const sse = openSse(reply);
        const trace = new TraceRecorder(deps.db, actor.id, conversationId, (event) => sse.send(event.type, event));
        trace.start();
        const ctx = { db: deps.db, sqlite: deps.sqlite, actor, traceId: trace.traceId, emit: (event: any) => trace.event(event) };
        try {
          const graph = buildAgentGraph({ provider: deps.provider, ctx, allTools });
          const result = await graph.invoke({
            messages: [...priorMessages, { role: "user", content: body.message }],
            actor,
            traceId: trace.traceId,
            intent: "business",
            stepCount: 0,
            pendingConfirmation: false,
            citations: [],
            toolCalls: [],
            toolCounts: {},
            budgetExceeded: false,
            finalText: "",
          });
          const finalText = (result as { finalText?: string }).finalText;
          if (finalText && finalText.trim().length > 0) {
            deps.db
              .insert(messages)
              .values({ id: `msg_${randomUUID()}`, conversationId, role: "assistant", content: finalText, createdAt: Date.now() })
              .run();
          }
          deps.db.update(conversations).set({ updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run();
          trace.end("ok");
          sse.end();
          return reply;
        } catch (error) {
          request.log.error(error);
          trace.event({
            type: "error",
            status: "error",
            payload: { code: "PROVIDER_ERROR", message: "模型服务暂时不可用，请稍后重试" },
          });
          trace.end("error");
          sse.end();
          return reply;
        }
      },
    );
  });
}
