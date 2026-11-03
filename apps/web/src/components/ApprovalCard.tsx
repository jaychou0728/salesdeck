import { useState } from "react";
import { useAppStore, useRole } from "../state/store";
import { apiPost, errorMessage } from "../api/business";
import { Button } from "./ui/Button";
import { Input } from "./ui/Field";

export function ApprovalCard({ approvalId }: { approvalId: string }) {
  const { addMessage, setPendingApproval, bumpData, pushToast } = useAppStore();
  const role = useRole();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isManager = role === "manager";

  async function decide(decision: "approve" | "reject") {
    setLoading(decision);
    setError(null);
    try {
      const result = await apiPost<{ data: { status: string; order?: { id: string; orderNo: string } } }>(`/api/approvals/${approvalId}/decide`, {
        decision,
        comment: comment.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      if (decision === "reject") {
        addMessage({ role: "assistant", content: "审批已驳回。" });
        pushToast("审批已驳回", "info");
      } else if (result?.data?.order) {
        addMessage({ role: "assistant", content: "订单已创建。" });
        pushToast(`已批准，订单 ${result.data.order.orderNo} 已创建`, "success");
      } else {
        addMessage({ role: "assistant", content: "审批已通过。" });
        pushToast("审批已通过", "success");
      }
      setPendingApproval(undefined);
      bumpData();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs">
      <div className="font-semibold text-amber-800">经理审批</div>
      <div className="mt-1 text-amber-700">该订单超过信用额度，需要经理批准后才能占用库存与额度。</div>
      {isManager ? (
        <div className="mt-3 space-y-2">
          <Input
            aria-label="审批意见"
            placeholder="审批意见（可选）"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="border-amber-200 bg-white"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="amber" disabled={loading !== null} onClick={() => decide("approve")}>
              {loading === "approve" ? "处理中…" : "批准"}
            </Button>
            <Button size="sm" variant="secondary" disabled={loading !== null} onClick={() => decide("reject")}>
              {loading === "reject" ? "处理中…" : "驳回"}
            </Button>
          </div>
          {error ? <div className="rounded bg-rose-50 p-1.5 text-rose-700">{error}</div> : null}
        </div>
      ) : (
        <div className="mt-3 text-amber-700">切换到经理老王后即可审批。</div>
      )}
    </div>
  );
}
