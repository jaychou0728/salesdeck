import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin text-slate-400", className)} size={18} />;
}

export function LoadingBlock({ label = "加载中…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-12 text-xs text-slate-500">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} />
        <span>{message}</span>
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="rounded-md border border-rose-300 px-2 py-1 font-medium hover:bg-rose-100">
          重试
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Inbox size={22} className="text-slate-300" />
      <div className="text-sm font-medium text-slate-700">{title}</div>
      {description ? <div className="max-w-md text-xs text-slate-500">{description}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
