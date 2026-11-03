import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { Citation, TraceEvent } from "@salespilot/shared";
import type { ChatMessage, ChatProvider } from "./provider.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import type { ToolContext, ToolDefinition } from "../tools/types.js";
import { executeTool, toolSpecs } from "../tools/registry.js";

interface GraphState {
  messages: ChatMessage[];
  actor: ToolContext["actor"];
  traceId: string;
  intent: string;
  stepCount: number;
  pendingConfirmation: boolean;
  citations: Citation[];
  toolCalls: ChatMessage["tool_calls"];
}

const AgentState = Annotation.Root({
  messages: Annotation<ChatMessage[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  actor: Annotation<GraphState["actor"]>({ reducer: (_a, b) => b }),
  traceId: Annotation<string>({ reducer: (_a, b) => b }),
  intent: Annotation<string>({ reducer: (_a, b) => b, default: () => "business" }),
  stepCount: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  pendingConfirmation: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  citations: Annotation<Citation[]>({ reducer: (_a, b) => b, default: () => [] }),
  toolCalls: Annotation<ChatMessage["tool_calls"]>({ reducer: (_a, b) => b, default: () => [] }),
});

export function buildAgentGraph(input: {
  provider: ChatProvider;
  ctx: ToolContext;
  allTools: ToolDefinition<any, any>[];
}) {
  const { provider, ctx, allTools } = input;
  const specs = toolSpecs(allTools);
  const toolMap = new Map(allTools.map((tool) => [tool.name, tool]));

  const graph = new StateGraph(AgentState)
    .addNode("classify", (state) => {
      const user = [...state.messages].reverse().find((message) => message.role === "user")?.content ?? "";
      const policy = /政策|保修|DOA|退换|换机|合同|账期|怎么处理/.test(user);
      ctx.emit({ type: "step.end", name: "intent", payload: { intent: policy ? "policy" : "business" } } as TraceEvent);
      return { intent: policy ? "policy" : "business" };
    })
    .addNode("retrieve", async (state) => {
      const user = [...state.messages].reverse().find((message) => message.role === "user")?.content ?? "";
      const tool = toolMap.get("search_knowledge");
      if (!tool) return { messages: [] };
      const outcome = await executeTool(tool, ctx, { query: user, topK: 5 });
      const data = outcome.model.ok ? (outcome.model.data as { chunks: Citation[]; hasSufficientEvidence: boolean }) : { chunks: [], hasSufficientEvidence: false };
      return {
        messages: [{ role: "system" as const, content: `知识库检索结果：\n${JSON.stringify(data.chunks)}` }],
        citations: data.chunks,
      };
    })
    .addNode("agent", async (state) => {
      const response = await provider.chat({
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...state.messages],
        tools: specs,
        stream: false,
      });
      const message = (response as any).choices[0].message as ChatMessage;
      return {
        messages: [message],
        toolCalls: message.tool_calls ?? [],
        stepCount: state.stepCount + (message.tool_calls ? 1 : 0),
      };
    })
    .addNode("tools", async (state) => {
      const toolMessages: ChatMessage[] = [];
      let pending = state.pendingConfirmation;
      for (const call of state.toolCalls ?? []) {
        const tool = toolMap.get(call.function.name);
        if (!tool) {
          toolMessages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "未知工具" } }) });
          continue;
        }
        const outcome = await executeTool(tool, ctx, JSON.parse(call.function.arguments || "{}"));
        if (outcome.model.ok && (outcome.model.data as { status?: string })?.status === "pending_confirmation") pending = true;
        toolMessages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(outcome.model) });
      }
      return { messages: toolMessages, toolCalls: [], pendingConfirmation: pending };
    })
    .addNode("respond", (state) => {
      const last = [...state.messages].reverse().find((message) => message.role === "assistant");
      const content = state.pendingConfirmation
        ? "已生成预览，请在下方确认。"
        : last?.content ?? "信息不足，请补充客户、SKU 和数量。";
      ctx.emit({ type: "token", payload: { delta: content } } as TraceEvent);
      return {};
    })
    .addEdge(START, "classify")
    .addConditionalEdges("classify", (state) => (state.intent === "policy" ? "retrieve" : "agent"), { retrieve: "retrieve", agent: "agent" })
    .addEdge("retrieve", "agent")
    .addConditionalEdges("agent", (state) => ((state.toolCalls ?? []).length > 0 ? "tools" : "respond"), { tools: "tools", respond: "respond" })
    .addConditionalEdges("tools", (state) => (state.pendingConfirmation || state.stepCount >= 8 ? "respond" : "agent"), { respond: "respond", agent: "agent" })
    .addEdge("respond", END);

  return graph.compile();
}
