import { useAppStore } from "../state/store";
import { cn } from "../lib/utils";

interface TimelineEvent {
  type: string;
  name?: string | null;
  status?: string | null;
  payload?: unknown;
  latencyMs?: number | null;
  seq?: number;
}

export function TraceTimeline({ events, emptyText }: { events?: TimelineEvent[]; emptyText?: string }) {
  const storeTrace = useAppStore((state) => state.trace);
  const trace = events ?? storeTrace;

  if (trace.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-400">
        {emptyText ?? "发送一条指令后，这里会出现每一次工具调用。"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trace.map((event, index) => {
        const failed = event.status === "error";
        const isStep = event.type === "step.start" || event.type === "step.end";
        return (
          <details
            key={`${event.seq ?? index}-${event.type}`}
            open={failed}
            className={cn(
              "rounded-lg border bg-white p-2.5 text-xs",
              failed ? "border-rose-200" : "border-slate-200",
            )}
          >
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
              <span className={cn("h-1.5 w-1.5 rounded-full", failed ? "bg-rose-500" : isStep ? "bg-teal-500" : "bg-slate-300")} />
              <span className="flex-1">{event.name ?? event.type}</span>
              {typeof event.latencyMs === "number" ? <span className="text-[10px] text-slate-400">{event.latencyMs}ms</span> : null}
              <span className={cn("text-[10px]", failed ? "text-rose-500" : "text-slate-400")}>{event.type}</span>
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-500">
              {JSON.stringify(event.payload ?? {}, null, 2)}
            </pre>
          </details>
        );
      })}
    </div>
  );
}
