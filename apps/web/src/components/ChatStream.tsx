import { useState } from "react";
import { useAppStore } from "../state/store";
import { streamChat } from "../api/sse";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { ArtifactCard } from "./ArtifactCard";
import { ApprovalCard } from "./ApprovalCard";

export function ChatStream() {
  const { actorId, messages, artifacts, streaming, pendingApprovalId, addMessage, addTrace, addArtifact, setStreaming, setPendingApproval } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [lastQuoteId, setLastQuoteId] = useState<string>();

  async function send(message: string) {
    setError(null);
    addMessage({ role: "user", content: message });
    setStreaming(true);
    let assistantText = "";
    try {
      await streamChat({
        message,
        actorId,
        onEvent: (sse) => {
          const traceEvent = sse.payload;
          if (sse.type === "step.start" || sse.type === "step.end") addTrace(traceEvent);
          if (sse.type === "artifact") addArtifact(traceEvent.payload);
          if (sse.type === "token") {
            assistantText += traceEvent.payload?.delta ?? "";
            addMessage({ role: "assistant", content: assistantText });
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

  function onCommitted(result: any) {
    if (result?.data?.status === "committed") {
      const message = result.data.ticket ? "工单已创建。" : result.data.order ? "订单已创建。" : "报价已生成。";
      addMessage({ role: "assistant", content: message });
      if (result.data.quote?.id) setLastQuoteId(result.data.quote.id);
    }
    if (result?.data?.approvalId) setPendingApproval(result.data.approvalId);
    if (result?.data?.status === "pending_approval" && result.data.approvalId) {
      setPendingApproval(result.data.approvalId);
      addMessage({ role: "assistant", content: "信用不足，已提交经理审批。" });
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.map((message, index) => <MessageBubble key={index} {...message} />)}
        {artifacts.map((artifact, index) => <ArtifactCard key={index} artifact={artifact} onCommitted={onCommitted} />)}
        {pendingApprovalId && <ApprovalCard approvalId={pendingApprovalId} />}
        {lastQuoteId && (
          <div className="flex justify-start">
            <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white" onClick={() => send(`把报价 ${lastQuoteId} 转成订单`)}>
              转订单
            </button>
          </div>
        )}
        {error && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      </div>
      <Composer onSend={send} disabled={streaming} />
    </section>
  );
}
