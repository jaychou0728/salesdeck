import { useEffect } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../state/store";
import { useApi, type TraceDetailResponse } from "../api/business";
import { TraceTimeline } from "./TraceTimeline";
import { LoadingBlock, ErrorBanner } from "./ui/Feedback";
import { formatDateTime, statusLabel } from "../lib/status";

export function AuditDrawer() {
  const { auditOpen, auditTraceId, auditEvents, closeAudit } = useAppStore();
  const { data, loading, error } = useApi<TraceDetailResponse>(
    auditOpen && auditTraceId ? `/api/business/traces/${auditTraceId}` : null,
  );

  useEffect(() => {
    if (!auditOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAudit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auditOpen, closeAudit]);

  if (!auditOpen) return null;

  const events = data?.events ?? auditEvents ?? [];
  const trace = data?.trace;

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-14 z-40 flex justify-end bg-slate-900/20"
      data-testid="audit-drawer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeAudit();
      }}
    >
      <aside className="flex h-full w-[420px] max-w-full flex-col border-l border-slate-200 bg-white shadow-2xl" aria-label="审计抽屉">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">执行详情</div>
            <div className="mt-0.5 text-[11px] text-slate-500">每一次工具调用、参数与结果都会留痕</div>
          </div>
          <button type="button" onClick={closeAudit} aria-label="关闭审计抽屉" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {auditTraceId ? (
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
              <div>
                <div className="text-slate-400">Trace</div>
                <div className="truncate font-mono">{auditTraceId}</div>
              </div>
              <div>
                <div className="text-slate-400">状态</div>
                <div>{trace ? statusLabel(trace.status) : "—"}</div>
              </div>
              <div>
                <div className="text-slate-400">操作人</div>
                <div>{trace?.actorId ?? "—"}</div>
              </div>
              <div>
                <div className="text-slate-400">开始时间</div>
                <div>{formatDateTime(trace?.startedAt)}</div>
              </div>
            </div>
          ) : null}

          {loading && auditTraceId ? (
            <LoadingBlock label="加载执行链路…" />
          ) : error ? (
            <ErrorBanner message={error} />
          ) : (
            <TraceTimeline events={events} emptyText="本次对话还没有工具调用记录。" />
          )}
        </div>
      </aside>
    </div>
  );
}
