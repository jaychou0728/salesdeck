import type { FastifyInstance } from "fastify";

export function registerHealth(app: FastifyInstance, provider: string) {
  app.after(() => {
    app.get(
      "/health",
      {
        schema: {
          tags: ["system"],
          summary: "Health check",
          response: { 200: { type: "object", properties: { ok: { type: "boolean" }, provider: { type: "string" } } } },
        },
      },
      async () => ({ ok: true, provider }),
    );
  });
}
