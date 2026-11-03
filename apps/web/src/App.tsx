import { ChatStream } from "./components/ChatStream";
import { useAppStore } from "./state/store";

export function App() {
  const { actorId, setActor } = useAppStore();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-slate-900" />
          <div className="text-sm font-semibold">SalesPilot</div>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">Mock / DeepSeek</span>
        </div>
        <select className="rounded-lg border border-slate-200 px-2 py-1 text-xs" value={actorId} onChange={(event) => setActor(event.target.value)}>
          <option value="u_sales_lin">销售小林</option>
          <option value="u_manager_wang">经理老王</option>
        </select>
      </header>
      <main className="flex min-h-0 flex-1">
        <ChatStream />
        <aside className="hidden w-[380px] border-l border-slate-200 bg-white p-4 lg:block">
          <div className="text-xs font-semibold text-slate-500">执行链路</div>
          <div className="mt-3 text-xs text-slate-400">工具调用与结果会显示在这里。</div>
        </aside>
      </main>
    </div>
  );
}
