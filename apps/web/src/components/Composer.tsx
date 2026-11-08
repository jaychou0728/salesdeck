import { SendHorizontal } from "lucide-react";
import { useState } from "react";
import { useRole } from "../state/store";

const SALES_PROMPTS = ["今天哪些客户最值得跟进", "帮我推进华辰设计", "记录一条跟进"];
const MANAGER_PROMPTS = ["本月哪些单最危险", "团队高风险商机", "查看待执行跟进"];

export function Composer({ onSend, disabled }: { onSend: (message: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState("");
  const role = useRole();
  const prompts = role === "manager" ? MANAGER_PROMPTS : SALES_PROMPTS;

  function submit() {
    const message = value.trim();
    if (!message) return;
    onSend(message);
    setValue("");
  }

  return (
    <div className="border-t border-slate-200 bg-white p-4">
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1 text-xs">
        {prompts.map((example) => (
          <button
            key={example}
            type="button"
            disabled={disabled}
            className="whitespace-nowrap rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => onSend(example)}
          >
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
              submit();
            }
          }}
        />
        <button
          type="button"
          className="rounded-xl bg-slate-900 p-2 text-white disabled:opacity-40"
          aria-label="发送"
          disabled={disabled || !value.trim()}
          onClick={submit}
        >
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
