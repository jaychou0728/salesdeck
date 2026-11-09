import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "@salesdeck/shared";
import type { Db } from "../db/client.js";
import { resolveActor } from "../lib/actor.js";
import { recordFollowUp } from "../domain/followUps.js";

const CREATE = z.object({
  customerId: z.string().min(1),
  opportunityId: z.string().min(1).optional(),
  type: z.enum(["call", "wechat", "email", "meeting", "quote", "system"]),
  content: z.string().min(2).max(1000),
  result: z.string().max(500).optional(),
  nextAction: z.string().max(200).optional(),
  nextActionDueAt: z.number().int().nonnegative().optional(),
});

const ERROR_STATUS: Record<string, number> = { VALIDATION_ERROR: 400, NOT_FOUND: 404, FORBIDDEN: 403 };

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.code(ERROR_STATUS[error.code] ?? 400).send({ ok: false, error: { code: error.code, message: error.message } });
  }
  return reply.code(500).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "服务器内部错误" } });
}

export function registerFollowUps(app: FastifyInstance, deps: { db: Db }) {
  app.after(() => {
    app.post(
      "/api/business/follow-ups",
      { attachValidation: true, schema: { tags: ["workspace"], summary: "Record a follow-up and update the opportunity" } },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const actor = resolveActor(deps.db, request);
          const parsed = CREATE.safeParse(request.body);
          if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请求参数不合法", parsed.error.issues);
          return { ok: true, ...recordFollowUp(deps.db, actor, parsed.data) };
        } catch (error) {
          return sendError(reply, error);
        }
      },
    );
  });
}
