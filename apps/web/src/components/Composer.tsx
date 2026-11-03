import { SendHorizontal } from "lucide-react";
import { useState } from "react";

export function Composer({ onSend, disabled }: { onSend: (message: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div className="border-t border-slate-200 bg-white p-4">
      <div className="mb-2 flex gap-2 text-xs">
        {["给华辰设计报价 120 台 X1", "今日晨报", "华辰开不了机怎么处理"].map((example) => (
          <button key={example} className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50" onClick={() => setValue(example)}>
            {example}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
        <textarea
          className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
          placeholder="告诉我要做什么…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (value.trim()) { onSend(value.trim()); setValue(""); }
            }
          }}
        />
        <button className="rounded-xl bg-slate-900 p-2 text-white disabled:opacity-40" aria-label="发送" disabled={disabled || !value.trim()} onClick={() => { onSend(value.trim()); setValue(""); }}>
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
