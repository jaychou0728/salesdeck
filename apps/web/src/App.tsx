import { useState } from "react";
import { ChatStream } from "./components/ChatStream";
import { TraceTimeline } from "./components/TraceTimeline";
import { BusinessPanel } from "./components/BusinessPanel";
import { BriefingDrawer } from "./components/BriefingDrawer";
import { useAppStore } from "./state/store";

export function App() {
  const { actorId, setActor } = useAppStore();
  const [tab, setTab] = useState<"trace" | "business">("trace");
  const [briefingOpen, setBriefingOpen] = useState(false);
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-slate-900" />
          <div className="text-sm font-semibold">SalesPilot</div>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">Mock / DeepSeek</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-lg border border-slate-200 px-2 py-1 text-xs" onClick={() => setBriefingOpen(true)}>晨报</button>
          <select className="rounded-lg border border-slate-200 px-2 py-1 text-xs" value={actorId} onChange={(event) => setActor(event.target.value)}>
            <option value="u_sales_lin">销售小林</option>
            <option value="u_manager_wang">经理老王</option>
          </select>
        </div>
      </header>
      <main className="flex min-h-0 flex-1">
        <ChatStream />
        <aside className="hidden w-[380px] flex-col border-l border-slate-200 bg-white lg:flex">
          <div className="flex border-b border-slate-200">
            <button className={`flex-1 px-3 py-2 text-xs ${tab === "trace" ? "font-semibold text-slate-900" : "text-slate-500"}`} onClick={() => setTab("trace")}>执行链路</button>
            <button className={`flex-1 px-3 py-2 text-xs ${tab === "business" ? "font-semibold text-slate-900" : "text-slate-500"}`} onClick={() => setTab("business")}>业务</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{tab === "trace" ? <TraceTimeline /> : <BusinessPanel />}</div>
        </aside>
      </main>
      <BriefingDrawer open={briefingOpen} onClose={() => setBriefingOpen(false)} />
    </div>
  );
}
