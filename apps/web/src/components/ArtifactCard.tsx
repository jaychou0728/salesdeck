import type { Artifact } from "@salespilot/shared";
import { formatMoney } from "../lib/utils";
import { ConfirmationCard } from "./ConfirmationCard";

export function ArtifactCard({ artifact, onCommitted }: { artifact: Artifact; onCommitted: (result: any) => void }) {
  if (artifact.kind === "quote" && artifact.confirmationToken) return <ConfirmationCard artifact={artifact} onCommitted={onCommitted} />;
  const payload = artifact.payload as any;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">{artifact.title}</div>
      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">{JSON.stringify(payload, null, 2)}</pre>
      {payload?.preview?.totalCents ? <div className="mt-2 text-xs">合计 {formatMoney(payload.preview.totalCents)}</div> : null}
    </div>
  );
}
