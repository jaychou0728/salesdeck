import { useEffect } from "react";
import { Bot, X } from "lucide-react";
import { useAppStore } from "../state/store";
import { ChatStream } from "./ChatStream";

export function AiDrawer() {
  const { aiOpen, closeAi } = useAppStore();

  useEffect(() => {
    if (!aiOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAi();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiOpen, closeAi]);

  if (!aiOpen) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-14 z-40 flex justify-end bg-slate-900/20"
      data-testid="ai-drawer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeAi();
      }}
    >
      <aside className="flex h-full w-[420px] max-w-full flex-col border-l border-slate-200 bg-white shadow-2xl" aria-label="AI 助手抽屉">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-teal-50 p-1.5 text-teal-700">
              <Bot size={16} />
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-900">AI 助手</div>
              <div className="text-[11px] text-slate-500">帮你判断今天推进谁、下一步怎么做</div>
            </div>
          </div>
          <button type="button" onClick={closeAi} aria-label="关闭 AI 助手" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
        <ChatStream />
      </aside>
    </div>
  );
}
