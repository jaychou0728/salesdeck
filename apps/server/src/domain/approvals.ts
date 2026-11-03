import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { AppError } from "@salespilot/shared";
import { approvals, quotes, users } from "../db/schema.js";
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
        return { status: decision === "approve" ? "approved" : "rejected" };
      },
    );
    return { ...result.value, replayed: result.replayed };
  })();
}
