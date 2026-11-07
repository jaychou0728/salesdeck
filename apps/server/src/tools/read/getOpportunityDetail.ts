import { AppError, GetOpportunityDetailInput, fail, ok } from "@salespilot/shared";
import { buildOpportunityDetail } from "../../domain/workspace.js";
import type { ToolDefinition } from "../types.js";

export const getOpportunityDetail: ToolDefinition<GetOpportunityDetailInput, unknown> = {
  name: "get_opportunity_detail",
  description: "读取单个商机的完整上下文：客户、关联报价/订单、最近跟进、风险信号和建议下一步。",
  inputSchema: GetOpportunityDetailInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    try {
      return { model: ok(buildOpportunityDetail(ctx.db, ctx.actor, input.opportunityId)) };
    } catch (error) {
      if (error instanceof AppError) {
        return { model: fail(error.code, error.message, { details: error.details, suggestedAction: error.suggestedAction }) };
      }
      return { model: fail("PROVIDER_ERROR", "读取商机失败") };
    }
  },
};
