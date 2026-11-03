import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { traceEvents, traces } from "../db/schema.js";

export function registerTraces(app: FastifyInstance, deps: { db: Db }) {
  app.get("/api/traces/:id", async (request) => {
    const { id } = request.params as { id: string };
    return { trace: deps.db.select().from(traces).where(eq(traces.id, id)).get(), events: deps.db.select().from(traceEvents).where(eq(traceEvents.traceId, id)).orderBy(traceEvents.seq).all() };
  });
}
