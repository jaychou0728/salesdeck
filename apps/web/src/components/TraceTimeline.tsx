import { useAppStore } from "../state/store";

export function TraceTimeline() {
  const trace = useAppStore((state) => state.trace);
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-500">执行链路</div>
      {trace.length === 0 && <div className="text-xs text-slate-400">发送一条指令后，这里会出现每一次工具调用。</div>}
      {trace.map((event, index) => (
        <details key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-slate-700">
            {event.name ?? event.type} {event.status === "error" ? "⚠" : ""}
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto text-[10px] text-slate-500">{JSON.stringify(event.payload, null, 2)}</pre>
        </details>
      ))}
    </div>
  );
}
