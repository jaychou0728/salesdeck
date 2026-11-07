import { SuggestActionsInput, ok } from "@salespilot/shared";
import type { ToolDefinition } from "../types.js";

export const suggestActions: ToolDefinition<SuggestActionsInput, unknown> = {
  name: "suggest_actions",
  description:
    "向销售展示 1–4 个可继续执行的选项。只在需要用户选择下一步时调用；返回 UI 按钮，不产生业务副作用。",
  inputSchema: SuggestActionsInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(_ctx, input) {
    return {
      model: ok({ actions: input.actions }),
      artifacts: [
        {
          kind: "actions",
          toolName: "suggest_actions",
          title: "可继续执行",
          payload: { actions: input.actions },
        },
      ],
    };
  },
};
