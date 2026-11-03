import { useState } from "react";
import type { Artifact } from "@salespilot/shared";
import { formatMoney } from "../lib/utils";

export function ConfirmationCard({ artifact, onCommitted }: { artifact: Artifact; onCommitted: (result: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [committed, setCommitted] = useState(false);
  const payload = artifact.payload as any;
  const input = payload?.input;
  const preview = payload?.preview;
  const lines = preview?.lines ?? preview?.preview?.lines ?? [];
  const total = preview?.totals?.totalCents ?? preview?.preview?.totals?.totalCents ?? preview?.totalCents ?? 0;

  async function confirm() {
    setLoading(true);
    const response = await fetch("/api/confirmations/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-id": "u_sales_lin" },
      body: JSON.stringify({ token: artifact.confirmationToken, toolName: artifact.toolName ?? "create_quote", payload: input, idempotencyKey: crypto.randomUUID() }),
    });
    const result = await response.json();
    setLoading(false);
    setCommitted(true);
    onCommitted(result);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{artifact.title}</div>
        <div className="text-xs text-slate-500">{formatMoney(total)}</div>
      </div>
      <div className="space-y-1 text-xs text-slate-600">
        {lines.map((line: any) => (
          <div key={line.sku} className="flex justify-between">
            <span>{line.sku} × {line.quantity}</span>
            <span>{formatMoney(line.finalPriceCents ?? line.unitPriceCents)}</span>
          </div>
        ))}
        {preview?.riskFlags?.length > 0 && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-700">{preview.riskFlags[0].message}</div>}
      </div>
      {committed ? (
        <div className="mt-3 text-xs text-emerald-700">已提交</div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40" disabled={loading} onClick={confirm}>
            {loading ? "提交中…" : "确认生成"}
          </button>
          <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">调整</button>
          <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">取消</button>
        </div>
      )}
    </div>
  );
}
