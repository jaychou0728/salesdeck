import { GetSalesPrioritiesInput, fail, ok } from "@salesdeck/shared";
import { buildWorkspace } from "../../domain/workspace.js";
import type { ToolDefinition } from "../types.js";

export const getSalesPriorities: ToolDefinition<GetSalesPrioritiesInput, unknown> = {
  name: "get_sales_priorities",
  description: "获取今日销售优先级、关键指标和待办。销售只能看自己；经理可看团队。",
  inputSchema: GetSalesPrioritiesInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    if (input.scope === "team" && ctx.actor.role !== "manager") {
      return { model: fail("FORBIDDEN", "销售只能查看自己的优先级") };
    }
    const workspace = buildWorkspace(ctx.db, ctx.actor, { scope: input.scope });
    const items =
      input.focus === "risk"
        ? workspace.risks
        : input.focus === "follow_up"
          ? workspace.priorities.filter((item) => item.signals.overdueDays > 0 || item.signals.idleDays >= 3)
          : workspace.priorities;
    return {
      model: ok({
        scope: input.scope,
        headline: workspace.headline,
        metrics: workspace.metrics,
        priorities: items.slice(0, input.limit),
        todos: workspace.todos,
        ranking: workspace.ranking,
      }),
    };
  },
};
