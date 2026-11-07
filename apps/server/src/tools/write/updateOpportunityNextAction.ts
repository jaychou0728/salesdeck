import { eq } from "drizzle-orm";
import { UpdateOpportunityNextActionInput, fail, ok } from "@salespilot/shared";
import { opportunities } from "../../db/schema.js";
import { consumeConfirmationToken, issueConfirmationToken } from "../../domain/confirmation.js";
import { withIdempotency } from "../../domain/idempotency.js";
import { scopedOwnerIds } from "../../lib/actor.js";
import type { ToolDefinition } from "../types.js";

const businessPayload = (input: UpdateOpportunityNextActionInput) => ({
  opportunityId: input.opportunityId,
  nextAction: input.nextAction,
  nextActionDueAt: input.nextActionDueAt,
});

export const updateOpportunityNextAction: ToolDefinition<UpdateOpportunityNextActionInput, unknown> = {
  name: "update_opportunity_next_action",
  description: "更新商机的下一步行动与截止时间。必须先 dry-run 预览，用户确认后提交。",
  inputSchema: UpdateOpportunityNextActionInput,
  kind: "write",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const opportunity = ctx.db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).get();
    if (!opportunity) return { model: fail("NOT_FOUND", "商机不存在") };
    if (!scopedOwnerIds(ctx.db, ctx.actor).includes(opportunity.ownerId)) {
      return { model: fail("FORBIDDEN", "无权操作该商机") };
    }
    if (input.dryRun) {
      const { token, expiresAt } = issueConfirmationToken(ctx.db, {
        actorId: ctx.actor.id,
        toolName: "update_opportunity_next_action",
        payload: businessPayload(input),
      });
      return {
        model: ok({
          status: "pending_confirmation",
          preview: {
            opportunityId: opportunity.id,
            name: opportunity.name,
            nextAction: input.nextAction,
            nextActionDueAt: input.nextActionDueAt,
          },
          expiresAt,
        }),
        artifacts: [
          {
            kind: "next_action",
            toolName: "update_opportunity_next_action",
            title: "下一步行动预览",
            payload: { preview: businessPayload(input), input: businessPayload(input) },
            confirmationToken: token,
          },
        ],
      };
    }
    const result = withIdempotency(
      ctx.db,
      { key: input.idempotencyKey!, actorId: ctx.actor.id, toolName: "update_opportunity_next_action", request: businessPayload(input) },
      () => {
        consumeConfirmationToken(ctx.db, input.confirmationToken!, {
          actorId: ctx.actor.id,
          toolName: "update_opportunity_next_action",
          payload: businessPayload(input),
        });
        ctx.db.update(opportunities).set({
          nextAction: input.nextAction,
          nextActionDueAt: input.nextActionDueAt ?? null,
          updatedAt: Date.now(),
        }).where(eq(opportunities.id, input.opportunityId)).run();
        return { opportunityId: input.opportunityId, nextAction: input.nextAction, nextActionDueAt: input.nextActionDueAt ?? null };
      },
    );
    return { model: ok({ status: "committed", ...result.value, replayed: result.replayed }) };
  },
};
