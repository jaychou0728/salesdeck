import { useState } from "react";
import type { Artifact } from "@salespilot/shared";
import { formatMoney } from "../lib/utils";
import { useAppStore } from "../state/store";
import { apiPost, errorMessage } from "../api/business";
import { FOLLOW_UP_TYPE_LABELS } from "../lib/opportunity";
import { Button } from "./ui/Button";

export function ConfirmationCard({ artifact, onCommitted }: { artifact: Artifact; onCommitted: (result: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pushToast = useAppStore((state) => state.pushToast);

  const payload = artifact.payload as any;
  const input = payload?.input;
  const preview = payload?.preview ?? {};
  const lines: any[] = preview?.lines ?? [];
  const total = preview?.totals?.totalCents ?? preview?.totalCents ?? 0;
  const isConvert = artifact.toolName === "convert_quote_to_order";
  const isFollowUp = artifact.toolName === "log_follow_up";
  const isNextAction = artifact.toolName === "update_opportunity_next_action";
  const confirmLabel = isConvert ? "确认提交" : isFollowUp ? "确认记录" : isNextAction ? "确认更新" : "确认生成";

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<any>("/api/confirmations/confirm", {
        token: artifact.confirmationToken,
        toolName: artifact.toolName ?? "create_quote",
        payload: input,
        idempotencyKey: crypto.randomUUID(),
      });
      setCommitted(true);
      onCommitted(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (dismissed && !committed) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">{artifact.title}</div>
          {preview?.customer?.name ? <div className="mt-0.5 text-[11px] text-slate-500">{preview.customer.name}</div> : null}
        </div>
        {!isFollowUp && !isNextAction ? (
          <div className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(total)}</div>
        ) : null}
      </div>

      {isConvert ? (
        <div className="mb-2 space-y-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
          <div className="flex justify-between">
            <span>报价单</span>
            <span className="font-medium">{preview.quoteNo ?? preview.quoteId}</span>
          </div>
          <div className="flex justify-between">
            <span>信用可用</span>
            <span>{formatMoney(preview.creditAvailableCents ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span>库存可满足</span>
            <span className={preview.canFulfill === false ? "text-rose-600" : "text-emerald-700"}>{preview.canFulfill === false ? "否" : "是"}</span>
          </div>
          {preview.requiresApproval ? <div className="text-amber-700">信用不足，提交后将转经理审批。</div> : null}
        </div>
      ) : null}

      {isFollowUp ? (
        <div className="mb-2 space-y-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
          <div className="flex justify-between"><span>跟进方式</span><span className="font-medium">{FOLLOW_UP_TYPE_LABELS[preview.type] ?? preview.type}</span></div>
          <div>内容：{preview.content}</div>
          {preview.result ? <div>结果：{preview.result}</div> : null}
          {preview.nextAction ? <div>下一步：{preview.nextAction}</div> : null}
        </div>
      ) : null}

      {isNextAction ? (
        <div className="mb-2 space-y-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
          <div>商机：{preview.name ?? preview.opportunityId}</div>
          <div>下一步：{preview.nextAction}</div>
        </div>
      ) : null}

      <div className="space-y-1 text-xs text-slate-600">
        {lines.map((line: any, index: number) => (
          <div key={`${line.sku ?? line.productId}-${index}`} className="flex justify-between">
            <span>
              {line.sku ?? line.productName} × {line.convertingQuantity ?? line.quantity}
            </span>
            <span>{formatMoney(line.lineTotalCents ?? line.finalPriceCents ?? line.unitPriceCents ?? 0)}</span>
          </div>
        ))}
        {preview?.riskFlags?.length > 0 ? (
          <div className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-700">{preview.riskFlags[0].message}</div>
        ) : null}
      </div>

      {error ? <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">{error}</div> : null}

      {committed ? (
        <div className="mt-3 text-xs font-medium text-emerald-700">已提交</div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={loading} onClick={confirm}>
            {loading ? "提交中…" : confirmLabel}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDismissed(true);
              pushToast("请在对话框里说明需要调整的内容", "info");
            }}
          >
            调整
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDismissed(true)}>
            取消
          </Button>
        </div>
      )}
    </div>
  );
}
