import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={isUser ? "max-w-[80%] rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white" : "max-w-[85%] rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200"}>
        {isUser ? (
          content
        ) : (
          <div className="prose prose-sm max-w-none prose-slate prose-headings:mb-2 prose-headings:mt-3 prose-p:my-1 prose-li:my-0.5 prose-table:text-xs prose-pre:bg-slate-900 prose-pre:text-slate-100">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
