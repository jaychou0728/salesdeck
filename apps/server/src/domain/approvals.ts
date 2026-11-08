import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AppError } from "@salespilot/shared";
import { approvals, customers, opportunities, quotes, users } from "../db/schema.js";
import { assertManager } from "./permissions.js";
import { withIdempotency } from "./idempotency.js";
import { createOrderFromQuote } from "./orders.js";
import type { ToolContext } from "../tools/types.js";

export function createApproval(
  ctx: ToolContext,
  input: { type: string; targetType: string; targetId: string; requesterId: string; reason: string; payload: unknown },
) {
  const approvalId = `ap_${randomUUID()}`;
  ctx.db.insert(approvals).values({
    id: approvalId,
    type: input.type,
    targetType: input.targetType,
    targetId: input.targetId,
    requesterId: input.requesterId,
    approverId: null,
    status: "pending",
    reason: input.reason,
    comment: null,
    payloadJson: JSON.stringify(input.payload),
    createdAt: Date.now(),
    decidedAt: null,
  }).run();
  return approvalId;
}

function markOpportunityRejectedAfterApproval(ctx: ToolContext, quoteId: string, nextAction: string) {
  const quote = ctx.db.select().from(quotes).where(eq(quotes.id, quoteId)).get();
  if (!quote) return;
  const opportunity = quote.opportunityId
    ? ctx.db.select().from(opportunities).where(eq(opportunities.id, quote.opportunityId)).get()
    : ctx.db
        .select()
        .from(opportunities)
        .where(and(eq(opportunities.customerId, quote.customerId), inArray(opportunities.stage, ["quote", "negotiation"])))
        .orderBy(desc(opportunities.updatedAt))
        .get();
  if (!opportunity) return;
  ctx.db
    .update(opportunities)
    .set({
      nextAction,
      riskLevel: "high",
      updatedAt: Date.now(),
    })
    .where(eq(opportunities.id, opportunity.id))
    .run();
}

export function decideApproval(
  ctx: ToolContext,
  approvalId: string,
  decision: "approve" | "reject",
  comment: string | undefined,
  idempotencyKey: string,
) {
  assertManager(ctx.actor);
  return ctx.sqlite.transaction(() => {
    const result = withIdempotency(
      ctx.db,
      { key: idempotencyKey, actorId: ctx.actor.id, toolName: "decide_approval", request: { approvalId, decision } },
      () => {
        const approval = ctx.db.select().from(approvals).where(eq(approvals.id, approvalId)).get();
        if (!approval) throw new AppError("NOT_FOUND", "审批不存在");
        if (approval.status !== "pending") throw new AppError("INVALID_STATE", "审批已处理");
        const requester = ctx.db.select().from(users).where(eq(users.id, approval.requesterId)).get();
        if (requester && requester.teamId !== ctx.actor.teamId) {
          throw new AppError("FORBIDDEN", "无权审批其他团队的申请");
        }
        ctx.db.update(approvals).set({ status: decision === "approve" ? "approved" : "rejected", approverId: ctx.actor.id, comment: comment ?? null, decidedAt: Date.now() }).where(eq(approvals.id, approvalId)).run();
        if (decision === "reject" && approval.type === "quote_price") {
          const payload = JSON.parse(approval.payloadJson) as { quoteId: string };
          ctx.db.update(quotes).set({ status: "rejected" }).where(eq(quotes.id, payload.quoteId)).run();
          markOpportunityRejectedAfterApproval(ctx, payload.quoteId, "报价被驳回，重新评估价格与审批路径");
          return { status: "rejected" };
        }
        if (decision === "reject" && approval.type === "order_conversion") {
          const payload = JSON.parse(approval.payloadJson) as { quoteId: string };
          markOpportunityRejectedAfterApproval(ctx, payload.quoteId, "转订单审批被驳回，重新确认信用与付款方案");
          return { status: "rejected" };
        }
        if (decision === "approve" && approval.type === "quote_price") {
          const payload = JSON.parse(approval.payloadJson) as { quoteId: string };
          ctx.db.update(quotes).set({ status: "approved" }).where(eq(quotes.id, payload.quoteId)).run();
          return { status: "approved" };
        }
        if (decision === "approve" && approval.type === "order_conversion") {
          const payload = JSON.parse(approval.payloadJson) as { quoteId: string; paymentTerms: string };
          return { status: "approved", order: createOrderFromQuote(ctx, payload.quoteId, payload.paymentTerms, { allowOverCredit: true }) };
        }
        if (approval.type === "credit_limit") {
          const payload = JSON.parse(approval.payloadJson) as { customerId: string; requestedLimitCents: number };
          if (decision === "approve") {
            ctx.db
              .update(customers)
              .set({ creditLimitCents: payload.requestedLimitCents })
              .where(eq(customers.id, payload.customerId))
              .run();
            return { status: "approved", creditLimitCents: payload.requestedLimitCents };
          }
          const opportunity = ctx.db
            .select()
            .from(opportunities)
            .where(and(eq(opportunities.customerId, payload.customerId), inArray(opportunities.stage, ["quote", "negotiation"])))
            .orderBy(desc(opportunities.updatedAt))
            .get();
          if (opportunity) {
            ctx.db
              .update(opportunities)
              .set({ nextAction: "提额申请被驳回，考虑拆单或调整付款方案", riskLevel: "high", updatedAt: Date.now() })
              .where(eq(opportunities.id, opportunity.id))
              .run();
          }
          return { status: "rejected" };
        }
        return { status: decision === "approve" ? "approved" : "rejected" };
      },
    );
    return { ...result.value, replayed: result.replayed };
  })();
}
