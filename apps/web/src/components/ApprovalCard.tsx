import { useState } from "react";
import { useAppStore } from "../state/store";

export function ApprovalCard({ approvalId }: { approvalId: string }) {
  const { actorId, addMessage, setPendingApproval } = useAppStore();
  const [loading, setLoading] = useState(false);
  const isManager = actorId === "u_manager_wang";

  async function decide() {
    setLoading(true);
    const response = await fetch(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-id": actorId },
      body: JSON.stringify({ decision: "approve", comment: "同意，注意回款", idempotencyKey: crypto.randomUUID() }),
    });
    const result = await response.json();
    setLoading(false);
    if (result.ok) {
      addMessage({ role: "assistant", content: "订单已创建。" });
      setPendingApproval(undefined);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs">
      <div className="font-semibold text-amber-800">经理审批</div>
      <div className="mt-1 text-amber-700">该订单超过信用额度，需要经理批准后才能占用库存与额度。</div>
      {isManager ? (
        <button className="mt-3 rounded-lg bg-amber-700 px-3 py-1.5 text-white disabled:opacity-40" disabled={loading} onClick={decide}>
          {loading ? "处理中…" : "批准"}
        </button>
      ) : (
        <div className="mt-3 text-amber-700">切换到经理老王后即可审批。</div>
      )}
    </div>
  );
}
