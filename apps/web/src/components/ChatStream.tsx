import { useEffect, useRef, useState } from "react";
import type { TraceEvent } from "@salesdeck/shared";
import { Activity, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useAppStore } from "../state/store";
import { streamChat } from "../api/sse";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { ArtifactCard } from "./ArtifactCard";
import { ApprovalCard } from "./ApprovalCard";
import { TraceTimeline } from "./TraceTimeline";
import { Button } from "./ui/Button";

export function ChatStream() {
  const {
    actorId,
    conversationId,
    messages,
    artifacts,
    streaming,
    pendingApprovalId,
    lastQuoteId,
    chatContext,
    trace,
    pendingPrompt,
    addMessage,
    updateLastAssistant,
    addTrace,
    addArtifact,
    removeArtifact,
    setStreaming,
    setPendingApproval,
    setLastQuoteId,
    setChatContext,
    setConversation,
    clearTransient,
    bumpData,
  } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "execution">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(message: string) {
    setError(null);
    clearTransient();
    addMessage({ role: "user", content: message });
    setStreaming(true);
    let assistantText = "";
    let assistantStarted = false;
    const convId = conversationId ?? crypto.randomUUID();
    if (!conversationId) setConversation(convId);
    try {
      await streamChat({
        message,
        actorId,
        conversationId: convId,
        onEvent: (sse) => {
          const traceEvent = sse.payload;
          if (sse.type !== "token" && traceEvent?.type) addTrace(traceEvent as TraceEvent);
          if (sse.type === "artifact") addArtifact(traceEvent.payload);
          if (sse.type === "token") {
            assistantText += traceEvent.payload?.delta ?? "";
            if (!assistantStarted) {
              addMessage({ role: "assistant", content: assistantText });
              assistantStarted = true;
            } else {
              updateLastAssistant(assistantText);
            }
          }
          if (sse.type === "error") setError(traceEvent.payload?.message ?? "请求失败");
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求失败");
    } finally {
      setStreaming(false);
    }
  }

  // Context prompts queued from business pages (e.g. "让 AI 报价").
  useEffect(() => {
    if (!pendingPrompt) return;
    const prompt = useAppStore.getState().consumePendingPrompt();
    if (prompt) void send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  // Keep the newest message in view as the user sends and the assistant streams.
  useEffect(() => {
    if (view !== "chat") return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, artifacts, streaming, pendingApprovalId, view]);

  function onCommitted(result: any) {
    const status = result?.data?.status;
    if (status === "committed") {
      const message = result.data.followUp
        ? "跟进已记录。"
        : result.data.nextAction
          ? "下一步已更新。"
          : result.data.ticket
            ? "工单已创建。"
            : result.data.order
              ? "订单已创建。"
              : "报价已生成。";
      addMessage({ role: "assistant", content: message });
      if (result.data.quote?.id) setLastQuoteId(result.data.quote.id);
      bumpData();
    }
    if (result?.data?.approvalId) setPendingApproval(result.data.approvalId);
    if (status === "pending_approval" && result.data.approvalId) {
      addMessage({ role: "assistant", content: "信用不足，已提交经理审批。" });
      bumpData();
    }
  }

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  const hasActionArtifact = artifacts.some((artifact) => artifact.kind === "actions");
  const actorName = actorId === "u_manager_wang" ? "老王" : "小林";
  const traceId = trace.find((event) => event.traceId)?.traceId;
  const toolCallCount = trace.filter(
    (event) => event.type === "step.start" && event.name && !["intent", "plan", "retrieval"].includes(event.name),
  ).length;
  const totalLatency = trace.reduce((sum, event) => sum + (event.latencyMs ?? 0), 0);
  const hasTraceError = trace.some((event) => event.status === "error");
  const needsConfirmation =
    !streaming &&
    !pendingApprovalId &&
    !lastQuoteId &&
    !hasActionArtifact &&
    /请确认|确认后|是否|吗[？?]/.test(lastAssistant);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="AI 助手视图">
          <button
            type="button"
            role="tab"
            aria-selected={view === "chat"}
            onClick={() => setView("chat")}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              view === "chat" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            对话
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "execution"}
            onClick={() => setView("execution")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              view === "execution" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            <Activity size={12} /> 执行过程
          </button>
        </div>
        <span className="text-[10px] text-slate-400">{view === "execution" ? `${toolCallCount} 次工具` : "AI 助手"}</span>
      </div>

      {chatContext ? (
        <div className="flex items-center justify-between gap-2 border-b border-teal-100 bg-teal-50 px-4 py-2 text-[11px] text-teal-800">
          <span className="truncate">{chatContext}</span>
          <button type="button" aria-label="清除上下文" onClick={() => setChatContext(undefined)} className="rounded p-0.5 text-teal-600 hover:bg-teal-100">
            <X size={13} />
          </button>
        </div>
      ) : null}

      {view === "execution" ? (
        <div className="flex-1 overflow-y-auto p-4" data-testid="execution-view">
          {trace.length > 0 ? (
            <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">执行摘要</span>
                <span className={hasTraceError ? "text-rose-600" : "text-emerald-700"}>
                  {hasTraceError ? "有错误" : "正常"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-500">
                <span>操作人 {actorName}</span>
                <span>{trace.length} 个事件</span>
                <span>{toolCallCount} 次工具调用</span>
                <span>总耗时 {totalLatency}ms</span>
              </div>
              {traceId ? <div className="mt-1 truncate font-mono text-[10px] text-slate-400">{traceId}</div> : null}
            </div>
          ) : null}
          <div className="mb-3 text-[11px] text-slate-500">每一次工具调用、参数与结果都会留痕，可展开查看。</div>
          <TraceTimeline events={trace} emptyText="本次对话还没有工具调用记录。" />
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4" data-testid="chat-messages">
            {messages.length === 0 && !pendingApprovalId ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs leading-relaxed text-slate-500">
                我是销售助手。可以帮你判断今天推进谁、查客户/库存、准备报价，或记录跟进和下一步。
                <div className="mt-2 text-[11px] text-slate-400">也可以点下方的快捷问题开始。</div>
              </div>
            ) : null}
            {messages.map((message, index) => (
              <MessageBubble key={index} {...message} />
            ))}
            {artifacts.map((artifact, index) => (
              <ArtifactCard
                key={index}
                artifact={artifact}
                onCommitted={onCommitted}
                onAction={(prompt) => {
                  removeArtifact(index);
                  setView("chat");
                  void send(prompt);
                }}
              />
            ))}
            {pendingApprovalId ? <ApprovalCard approvalId={pendingApprovalId} /> : null}
            {lastQuoteId ? (
              <div className="flex justify-start">
                <Button size="sm" onClick={() => send(`把报价 ${lastQuoteId} 转成订单`)} disabled={streaming}>
                  转订单
                </Button>
              </div>
            ) : null}
            {needsConfirmation ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  disabled={streaming}
                  onClick={() => send("确认，继续")}
                >
                  继续
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50"
                  disabled={streaming}
                  onClick={() => send("先不用")}
                >
                  先不用
                </button>
              </div>
            ) : null}
            {streaming ? <div className="text-[11px] text-slate-400">正在处理…</div> : null}
            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}
          </div>
          <Composer onSend={send} disabled={streaming} />
        </>
      )}
    </section>
  );
}
