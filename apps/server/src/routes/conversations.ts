import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { conversations, messages } from "../db/schema.js";

export function registerConversations(app: FastifyInstance, deps: { db: Db }) {
  app.get("/api/conversations", async (request) => {
    const actorId = (request.headers["x-actor-id"] as string | undefined) ?? "u_sales_lin";
    return deps.db.select().from(conversations).where(eq(conversations.actorId, actorId)).orderBy(desc(conversations.updatedAt)).all();
  });
  app.get("/api/conversations/:id", async (request) => {
    const { id } = request.params as { id: string };
    return deps.db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt).all();
  });
}
