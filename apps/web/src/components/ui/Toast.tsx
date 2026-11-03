import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useAppStore } from "../../state/store";
import { cn } from "../../lib/utils";

const STYLES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-slate-200 bg-white text-slate-700",
} as const;

export function ToastHost() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[320px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn("pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg", STYLES[toast.kind])}
        >
          {toast.kind === "success" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : null}
          {toast.kind === "error" ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : null}
          {toast.kind === "info" ? <Info size={15} className="mt-0.5 shrink-0" /> : null}
          <span className="flex-1 leading-relaxed">{toast.message}</span>
          <button type="button" aria-label="关闭提示" onClick={() => dismiss(toast.id)} className="text-slate-400 hover:text-slate-600">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
