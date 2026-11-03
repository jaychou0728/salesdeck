import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { conversations, messages } from "../db/schema.js";

export function registerConversations(app: FastifyInstance, deps: { db: Db }) {
  app.after(() => {
    app.get(
      "/api/conversations",
      { schema: { tags: ["chat"], summary: "List conversations for the current actor" } },
      async (request) => {
        const actorId = (request.headers["x-actor-id"] as string | undefined) ?? "u_sales_lin";
        return deps.db.select().from(conversations).where(eq(conversations.actorId, actorId)).orderBy(desc(conversations.updatedAt)).all();
      },
    );
    app.get(
      "/api/conversations/:id",
      {
        schema: {
          tags: ["chat"],
          summary: "List messages in a conversation",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      async (request) => {
        const { id } = request.params as { id: string };
        return deps.db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt).all();
      },
    );
  });
}
