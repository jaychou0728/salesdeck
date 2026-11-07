import type { ActionSuggestion, Artifact } from "@salespilot/shared";
import { formatMoney } from "../lib/utils";
import { ConfirmationCard } from "./ConfirmationCard";

export function ArtifactCard({
  artifact,
  onCommitted,
  onAction,
}: {
  artifact: Artifact;
  onCommitted: (result: any) => void;
  onAction?: (prompt: string) => void;
}) {
  const confirmable = artifact.confirmationToken && ["quote", "follow_up", "next_action"].includes(artifact.kind);
  if (confirmable) return <ConfirmationCard artifact={artifact} onCommitted={onCommitted} />;

  const payload = artifact.payload as any;
  if (artifact.kind === "actions") {
    const actions = (payload?.actions ?? []) as ActionSuggestion[];
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
        <div className="text-xs font-semibold text-teal-900">{artifact.title}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <button
              key={`${action.label}-${action.prompt}`}
              type="button"
              onClick={() => onAction?.(action.prompt)}
              className="rounded-lg border border-teal-200 bg-white px-2.5 py-2 text-left text-[11px] font-medium leading-snug text-teal-800 transition-colors hover:bg-teal-100"
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-teal-700/70">点击选项继续，不需要再输入“确认”。</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">{artifact.title}</div>
      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">{JSON.stringify(payload, null, 2)}</pre>
      {payload?.preview?.totalCents ? <div className="mt-2 text-xs">合计 {formatMoney(payload.preview.totalCents)}</div> : null}
    </div>
  );
}
