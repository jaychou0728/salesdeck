import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError, opportunityStage, riskLevel, type OpportunityStage, type RiskLevel } from "@salespilot/shared";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { resolveActor } from "../lib/actor.js";
import { buildOpportunityDetail, buildWorkspace, listOpportunityViews } from "../domain/workspace.js";
import { updateOpportunity } from "../domain/followUps.js";
import { executeTool, toolMap } from "../tools/index.js";

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
};

const PATCH = z.object({
  stage: opportunityStage.optional(),
  probability: z.number().int().min(0).max(100).optional(),
  riskLevel: riskLevel.optional(),
  nextAction: z.string().max(200).nullable().optional(),
  nextActionDueAt: z.number().int().nonnegative().nullable().optional(),
  amountCents: z.number().int().nonnegative().optional(),
  expectedCloseDate: z.number().int().nonnegative().optional(),
});

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.code(ERROR_STATUS[error.code] ?? 400).send({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details, suggestedAction: error.suggestedAction },
    });
  }
  return reply.code(500).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "服务器内部错误" } });
}

function handle(fn: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> | unknown) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(request, reply);
    } catch (error) {
      return sendError(reply, error);
    }
  };
}

export function registerWorkspace(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  const actorOf = (request: FastifyRequest) => resolveActor(deps.db, request);

  app.after(() => {
    app.get(
      "/api/business/workspace",
      { schema: { tags: ["workspace"], summary: "Sales war room: metrics, priorities, todos and risks" } },
      handle(async (request) => {
        const actor = actorOf(request);
        const workspace = buildWorkspace(deps.db, actor);
        const briefing = await executeTool(
          toolMap.get("get_sales_briefing")!,
          { db: deps.db, sqlite: deps.sqlite, actor, traceId: "workspace", emit: () => {} },
          { scope: actor.role === "manager" ? "team" : "self" },
        );
        const alerts = briefing.model.ok ? ((briefing.model.data as { alerts: unknown[] }).alerts ?? []) : [];
        return { ok: true, ...workspace, alerts };
      }),
    );

    app.get(
      "/api/business/opportunities",
      {
        schema: {
          tags: ["workspace"],
          summary: "List opportunities visible to the current actor",
          querystring: {
            type: "object",
            properties: {
              stage: { type: "string" },
              risk: { type: "string" },
              customerId: { type: "string" },
              ownerId: { type: "string" },
            },
          },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const query = request.query as { stage?: string; risk?: string; customerId?: string; ownerId?: string };
        const stageParsed = query.stage ? opportunityStage.safeParse(query.stage) : null;
        const riskParsed = query.risk ? riskLevel.safeParse(query.risk) : null;
        if (stageParsed && !stageParsed.success) throw new AppError("VALIDATION_ERROR", "无效的商机阶段");
        if (riskParsed && !riskParsed.success) throw new AppError("VALIDATION_ERROR", "无效的风险等级");
        const stage = stageParsed?.success ? (stageParsed.data as OpportunityStage) : undefined;
        const risk = riskParsed?.success ? (riskParsed.data as RiskLevel) : undefined;
        return {
          ok: true,
          opportunities: listOpportunityViews(deps.db, actor, { stage, risk, customerId: query.customerId, ownerId: query.ownerId }),
        };
      }),
    );

    app.get(
      "/api/business/opportunities/:id",
      { schema: { tags: ["workspace"], summary: "Opportunity detail with customer, quotes, orders and follow-ups" } },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        return { ok: true, ...buildOpportunityDetail(deps.db, actor, id) };
      }),
    );

    app.patch(
      "/api/business/opportunities/:id",
      { attachValidation: true, schema: { tags: ["workspace"], summary: "Update an opportunity's next action or stage" } },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const parsed = PATCH.safeParse(request.body);
        if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请求参数不合法", parsed.error.issues);
        return { ok: true, opportunity: updateOpportunity(deps.db, actor, id, parsed.data) };
      }),
    );
  });
}
