export function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  return (
    <div className={role === "user" ? "flex justify-end" : "flex justify-start"}>
      <div className={role === "user" ? "max-w-[80%] rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white" : "max-w-[85%] rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200"}>
        {content}
      </div>
    </div>
  );
}
