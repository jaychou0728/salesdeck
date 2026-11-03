import { useAppStore } from "../state/store";
import { formatMoney } from "../lib/utils";

export function BusinessPanel() {
  const artifacts = useAppStore((state) => state.artifacts);
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-slate-500">业务上下文</div>
      {artifacts.length === 0 && <div className="text-xs text-slate-400">客户、库存、报价与审批会显示在这里。</div>}
      {artifacts.map((artifact, index) => {
        const preview = (artifact.payload as any)?.preview;
        return (
          <div key={index} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
            <div className="font-medium">{artifact.title}</div>
            {preview?.customer?.name && <div className="mt-1 text-slate-500">客户：{preview.customer.name}</div>}
            {preview?.totals?.totalCents && <div className="text-slate-500">合计：{formatMoney(preview.totals.totalCents)}</div>}
            {preview?.requiresApproval && <div className="mt-1 rounded bg-amber-50 p-1 text-amber-700">需要经理审批</div>}
          </div>
        );
      })}
    </div>
  );
}
