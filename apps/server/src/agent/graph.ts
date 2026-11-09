import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { Citation, TraceEvent } from "@salesdeck/shared";
import type { ChatMessage, ChatProvider } from "./provider.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { sanitizeAssistantText } from "./sanitize.js";
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
  toolCounts: Record<string, number>;
  budgetExceeded: boolean;
  finalText: string;
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
  toolCounts: Annotation<Record<string, number>>({ reducer: (_a, b) => b, default: () => ({}) }),
  budgetExceeded: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  finalText: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
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
      const intent = policy ? "policy" : "business";
      ctx.emit({ type: "step.start", name: "intent", payload: { intent } } as TraceEvent);
      ctx.emit({ type: "step.end", name: "intent", payload: { intent } } as TraceEvent);
      const summary = policy ? "先检索知识库并核对引用" : "先确认客户 → 查库存/价格 → 生成预览";
      ctx.emit({ type: "step.end", name: "plan", payload: { summary } } as TraceEvent);
      return { intent };
    })
    .addNode("retrieve", async (state) => {
      const user = [...state.messages].reverse().find((message) => message.role === "user")?.content ?? "";
      const tool = toolMap.get("search_knowledge");
      if (!tool) return { messages: [] };
      const query = user.slice(0, 400);
      const outcome = await executeTool(tool, ctx, { query, topK: 5 });
      const data = outcome.model.ok
        ? (outcome.model.data as { chunks: Citation[]; hasSufficientEvidence: boolean })
        : { chunks: [] as Citation[], hasSufficientEvidence: false };
      const assistantCall: ChatMessage = {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_retrieve",
            type: "function",
            function: { name: "search_knowledge", arguments: JSON.stringify({ query, topK: 5 }) },
          },
        ],
      };
      const toolResult: ChatMessage = {
        role: "tool",
        tool_call_id: "call_retrieve",
        name: "search_knowledge",
        content: JSON.stringify(outcome.model),
      };
      const system: ChatMessage = {
        role: "system",
        content: `知识库检索结果（hasSufficientEvidence=${data.hasSufficientEvidence}）：${JSON.stringify(data.chunks)}。不要重复调用 search_knowledge；证据不足时必须明确说资料中没有，并建议转人工/建工单。`,
      };
      ctx.emit({
        type: "step.end",
        name: "retrieval",
        payload: { citations: data.chunks, hasSufficientEvidence: data.hasSufficientEvidence },
      } as TraceEvent);
      return { messages: [assistantCall, toolResult, system], citations: data.chunks };
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
        stepCount: state.stepCount + (message.tool_calls?.length ?? 0),
      };
    })
    .addNode("tools", async (state) => {
      const toolMessages: ChatMessage[] = [];
      let pending = state.pendingConfirmation;
      const counts = { ...state.toolCounts };
      let budgetExceeded = state.budgetExceeded;
      for (const call of state.toolCalls ?? []) {
        const tool = toolMap.get(call.function.name);
        if (!tool) {
          toolMessages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "未知工具" } }) });
          continue;
        }
        let args: unknown;
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          toolMessages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify({ ok: false, error: { code: "VALIDATION_ERROR", message: "工具参数不是合法 JSON", recoverable: false } }),
          });
          continue;
        }
        const nextCount = (counts[call.function.name] ?? 0) + 1;
        counts[call.function.name] = nextCount;
        if (nextCount > 3) {
          budgetExceeded = true;
          toolMessages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify({ ok: false, error: { code: "BUDGET_EXCEEDED", message: "工具调用次数超出限制", recoverable: false } }),
          });
          continue;
        }
        const outcome = await executeTool(tool, ctx, args);
        if (outcome.model.ok && (outcome.model.data as { status?: string })?.status === "pending_confirmation") pending = true;
        toolMessages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(outcome.model) });
      }
      return { messages: toolMessages, toolCalls: [], pendingConfirmation: pending, toolCounts: counts, budgetExceeded };
    })
    .addNode("respond", (state) => {
      const last = [...state.messages].reverse().find((message) => message.role === "assistant");
      let content: string;
      if (state.pendingConfirmation) {
        content = "已生成预览，请在下方确认。";
      } else if (state.budgetExceeded) {
        content = "这次查询需要多个业务步骤，已暂停。请先指定要查客户、库存还是报价，我按一步来处理。";
      } else {
        content = last?.content && last.content.trim().length > 0 ? last.content : "信息不足，请补充客户、SKU 和数量。";
      }
      content = sanitizeAssistantText(content);
      ctx.emit({ type: "token", payload: { delta: content } } as TraceEvent);
      return { finalText: content };
    })
    .addEdge(START, "classify")
    .addConditionalEdges("classify", (state) => (state.intent === "policy" ? "retrieve" : "agent"), { retrieve: "retrieve", agent: "agent" })
    .addEdge("retrieve", "agent")
    .addConditionalEdges("agent", (state) => ((state.toolCalls ?? []).length > 0 ? "tools" : "respond"), { tools: "tools", respond: "respond" })
    .addConditionalEdges("tools", (state) => (state.pendingConfirmation || state.budgetExceeded || state.stepCount >= 10 ? "respond" : "agent"), { respond: "respond", agent: "agent" })
    .addEdge("respond", END);

  return graph.compile();
}
