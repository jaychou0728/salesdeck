import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const CONTROL =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-400";

export function Field({ label, htmlFor, error, hint, children }: { label: ReactNode; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
      {hint ? <div className="text-[11px] text-slate-400">{hint}</div> : null}
      {error ? <div className="text-[11px] text-rose-600">{error}</div> : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cn(CONTROL, className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "resize-none", className)} {...props} />;
}

export function CreditBar({ utilization, className }: { utilization: number; className?: string }) {
  const percent = Math.max(0, Math.min(1, utilization));
  const tone = percent >= 0.9 ? "bg-rose-500" : percent >= 0.8 ? "bg-amber-500" : "bg-teal-600";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${percent * 100}%` }} />
    </div>
  );
}
