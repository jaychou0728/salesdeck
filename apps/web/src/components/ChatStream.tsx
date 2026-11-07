import { useEffect, useState } from "react";
import type { TraceEvent } from "@salespilot/shared";
import { Activity, X } from "lucide-react";
import { useAppStore } from "../state/store";
import { streamChat } from "../api/sse";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { ArtifactCard } from "./ArtifactCard";
import { ApprovalCard } from "./ApprovalCard";
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
    setStreaming,
    setPendingApproval,
    setLastQuoteId,
    setChatContext,
    setConversation,
    openAudit,
    bumpData,
  } = useAppStore();
  const [error, setError] = useState<string | null>(null);

  async function send(message: string) {
    setError(null);
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
  const needsConfirmation =
    !streaming &&
    !pendingApprovalId &&
    !lastQuoteId &&
    /请确认|确认后|是否|吗[？?]/.test(lastAssistant);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">AI 助手</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openAudit({ events: trace })}
          disabled={trace.length === 0}
          title={trace.length === 0 ? "暂无执行记录" : "查看本次执行链路"}
        >
          <Activity size={13} />
          查看执行详情
        </Button>
      </div>

      {chatContext ? (
        <div className="flex items-center justify-between gap-2 border-b border-teal-100 bg-teal-50 px-4 py-2 text-[11px] text-teal-800">
          <span className="truncate">{chatContext}</span>
          <button type="button" aria-label="清除上下文" onClick={() => setChatContext(undefined)} className="rounded p-0.5 text-teal-600 hover:bg-teal-100">
            <X size={13} />
          </button>
        </div>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto p-4" data-testid="chat-messages">
        {messages.length === 0 && !pendingApprovalId ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs leading-relaxed text-slate-500">
            我是销售助手。可以帮你查客户、查库存、报价、转订单或创建售后工单。业务页面里的操作也可以用这里的对话完成。
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["今天哪些客户最值得跟进", "帮我推进华辰设计", "记录一条跟进"].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <MessageBubble key={index} {...message} />
        ))}
        {artifacts.map((artifact, index) => (
          <ArtifactCard key={index} artifact={artifact} onCommitted={onCommitted} />
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
              确认
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50"
              disabled={streaming}
              onClick={() => send("取消")}
            >
              取消
            </button>
          </div>
        ) : null}
        {streaming ? <div className="text-[11px] text-slate-400">正在处理…</div> : null}
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}
      </div>
      <Composer onSend={send} disabled={streaming} />
    </section>
  );
}
