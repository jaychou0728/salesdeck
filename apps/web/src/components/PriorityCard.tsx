import { useState } from "react";
import type { PriorityItem } from "@salespilot/shared";
import { Link } from "react-router-dom";
import { ArrowRight, Bot, ClipboardList, User } from "lucide-react";
import { formatMoney } from "../lib/utils";
import { priorityLabel, priorityTone, riskTone, RISK_LABELS, STAGE_LABELS, stageTone } from "../lib/opportunity";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

export function PriorityCard({
  item,
  onAskAI,
  onLogFollowUp,
  showOwner = true,
}: {
  item: PriorityItem;
  onAskAI: (item: PriorityItem) => void;
  onLogFollowUp: (item: PriorityItem) => void;
  showOwner?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, item.reasons.length - 3);
  const reasons = expanded ? item.reasons : item.reasons.slice(0, 3);

  return (
    <article data-testid="priority-card" className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</Badge>
          <Badge tone={riskTone(item.riskLevel)}>{RISK_LABELS[item.riskLevel]}</Badge>
          <Badge tone={stageTone(item.stage)}>{STAGE_LABELS[item.stage] ?? item.stage}</Badge>
        </div>
        <div className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(item.amountCents)}</div>
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <User size={14} className="text-slate-400" />
          {item.customerName}
          <span className="text-slate-300">·</span>
          <span className="font-medium text-slate-700">{item.name}</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          成交概率 {item.probability}% ·{" "}
          <span title="用于排序的综合评分，不等于成交概率">优先级评分 {item.score}</span>
          {showOwner && item.ownerName ? ` · 负责人 ${item.ownerName}` : ""}
        </div>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        {reasons.map((reason) => (
          <li key={reason} className="flex gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            {reason}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 self-start text-[11px] text-slate-500 hover:text-teal-700"
        >
          {expanded ? "收起" : `展开剩余 ${hiddenCount} 条`}
        </button>
      ) : null}

      <div className="mt-3 rounded-lg bg-teal-50 p-2.5 text-xs text-teal-900">
        <span className="font-medium">建议：</span>
        {item.suggestedAction}
      </div>

      {item.nextAction ? (
        <div className="mt-2 text-[11px] text-slate-500">
          下一步：{item.nextAction}
          {item.nextActionDueAt
            ? ` · 截止 ${new Date(item.nextActionDueAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-1 gap-y-1 pt-3">
        <Link
          to={`/customers/${item.customerId}`}
          className="inline-flex items-center rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-teal-700"
        >
          查看客户
        </Link>
        <Link
          to={`/opportunities/${item.opportunityId}`}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-teal-700"
        >
          查看商机 <ArrowRight size={12} />
        </Link>
        <button
          type="button"
          onClick={() => onLogFollowUp(item)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-teal-700"
        >
          <ClipboardList size={13} /> 记录跟进
        </button>
        <Button size="sm" onClick={() => onAskAI(item)} className="ml-auto">
          <Bot size={13} /> 让 AI 帮我推进
        </Button>
      </div>
    </article>
  );
}
