import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { LogFollowUpInput, fail, ok } from "@salesdeck/shared";
import { customers, followUps, opportunities } from "../../db/schema.js";
import { consumeConfirmationToken, issueConfirmationToken } from "../../domain/confirmation.js";
import { withIdempotency } from "../../domain/idempotency.js";
import { scopedOwnerIds } from "../../lib/actor.js";
import type { ToolDefinition } from "../types.js";

const businessPayload = (input: LogFollowUpInput) => ({
  customerId: input.customerId,
  opportunityId: input.opportunityId,
  type: input.type,
  content: input.content,
  result: input.result,
  nextAction: input.nextAction,
  nextActionDueAt: input.nextActionDueAt,
});

export const logFollowUp: ToolDefinition<LogFollowUpInput, unknown> = {
  name: "log_follow_up",
  description: "记录一次客户跟进，并同步商机的下一步与截止时间。必须先 dry-run 预览，用户确认后提交。",
  inputSchema: LogFollowUpInput,
  kind: "write",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const customer = ctx.db.select().from(customers).where(eq(customers.id, input.customerId)).get();
    if (!customer) return { model: fail("NOT_FOUND", "客户不存在") };
    if (!scopedOwnerIds(ctx.db, ctx.actor).includes(customer.ownerId)) {
      return { model: fail("FORBIDDEN", "无权操作该客户") };
    }
    if (input.opportunityId) {
      const opportunity = ctx.db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).get();
      if (!opportunity || opportunity.customerId !== customer.id) {
        return { model: fail("NOT_FOUND", "商机不存在或不属于该客户") };
      }
      if (!scopedOwnerIds(ctx.db, ctx.actor).includes(opportunity.ownerId)) {
        return { model: fail("FORBIDDEN", "无权操作该商机") };
      }
    }

    if (input.dryRun) {
      const { token, expiresAt } = issueConfirmationToken(ctx.db, {
        actorId: ctx.actor.id,
        toolName: "log_follow_up",
        payload: businessPayload(input),
      });
      return {
        model: ok({
          status: "pending_confirmation",
          preview: {
            customer: { id: customer.id, name: customer.name },
            opportunityId: input.opportunityId,
            type: input.type,
            content: input.content,
            result: input.result,
            nextAction: input.nextAction,
            nextActionDueAt: input.nextActionDueAt,
          },
          expiresAt,
        }),
        artifacts: [
          {
            kind: "follow_up",
            toolName: "log_follow_up",
            title: "跟进记录预览",
            payload: { preview: businessPayload(input), input: businessPayload(input) },
            confirmationToken: token,
          },
        ],
      };
    }

    const result = withIdempotency(
      ctx.db,
      { key: input.idempotencyKey!, actorId: ctx.actor.id, toolName: "log_follow_up", request: businessPayload(input) },
      () => {
        consumeConfirmationToken(ctx.db, input.confirmationToken!, {
          actorId: ctx.actor.id,
          toolName: "log_follow_up",
          payload: businessPayload(input),
        });
        const now = Date.now();
        const id = `f_${randomUUID()}`;
        ctx.db.insert(followUps).values({
          id,
          customerId: input.customerId,
          opportunityId: input.opportunityId ?? null,
          actorId: ctx.actor.id,
          type: input.type,
          content: input.content,
          result: input.result ?? null,
          nextAction: input.nextAction ?? null,
          nextActionDueAt: input.nextActionDueAt ?? null,
          createdAt: now,
        }).run();
        if (input.opportunityId) {
          ctx.db.update(opportunities).set({
            lastFollowUpAt: now,
            nextAction: input.nextAction ?? undefined,
            nextActionDueAt: input.nextActionDueAt ?? undefined,
            updatedAt: now,
          }).where(eq(opportunities.id, input.opportunityId)).run();
        }
        return {
          followUp: {
            id,
            customerId: input.customerId,
            opportunityId: input.opportunityId ?? null,
            type: input.type,
            content: input.content,
            result: input.result ?? null,
            nextAction: input.nextAction ?? null,
            nextActionDueAt: input.nextActionDueAt ?? null,
            createdAt: now,
          },
        };
      },
    );
    return { model: ok({ status: "committed", followUp: result.value.followUp, replayed: result.replayed }) };
  },
};
