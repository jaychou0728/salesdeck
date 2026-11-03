import { useEffect, useState } from "react";
import { useAppStore } from "../state/store";

export function BriefingDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actorId = useAppStore((state) => state.actorId);
  const [alerts, setAlerts] = useState<any[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/briefing", { headers: { "x-actor-id": actorId } })
      .then((response) => response.json())
      .then((data) => setAlerts(data.alerts ?? []));
  }, [open, actorId]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-slate-900/20" onClick={onClose}>
      <div className="h-full w-[420px] overflow-y-auto bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 text-sm font-semibold">今日晨报</div>
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <div key={index} className="rounded-xl border border-slate-200 p-3 text-xs">
              <div className="font-medium">{alert.type}</div>
              <div className="mt-1 text-slate-600">{alert.why}</div>
              <div className="mt-1 text-slate-500">建议：{alert.suggestedAction}</div>
            </div>
          ))}
          {alerts.length === 0 && <div className="text-xs text-slate-400">暂无风险。</div>}
        </div>
      </div>
    </div>
  );
}
