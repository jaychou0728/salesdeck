import { Link } from "react-router-dom";
import type { TodoItem } from "@salesdeck/shared";
import { useRole } from "../state/store";
import { Card, CardBody, CardHeader } from "./ui/Card";
import { Badge } from "./ui/Badge";

const KIND_LABELS: Record<string, string> = {
  today_follow_up: "今日跟进",
  overdue_follow_up: "逾期跟进",
  approval: "待审批",
  quote_to_advance: "待推进报价",
  quote_expiring: "报价到期",
  ticket: "售后待处理",
  order: "待确认订单",
};

export function TodoPanel({
  groups,
}: {
  groups: {
    today: TodoItem[];
    overdue: TodoItem[];
    approvals: TodoItem[];
    quotesToAdvance: TodoItem[];
    quotesExpiring: TodoItem[];
    tickets: TodoItem[];
    orders: TodoItem[];
  };
}) {
  const role = useRole();
  const all = [
    ...groups.overdue,
    ...groups.today,
    ...groups.approvals,
    ...groups.orders,
    ...groups.quotesExpiring,
    ...groups.quotesToAdvance,
    ...groups.tickets,
  ];
  return (
    <Card>
      <CardHeader
        title="我的待办"
        description="按紧急程度排序"
        actions={<span className="text-[11px] text-slate-500">{all.length} 项</span>}
      />
      <CardBody className="space-y-2">
        {all.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">今天没有待办，保持节奏。</div>
        ) : (
          all.slice(0, 10).map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs hover:border-teal-200 hover:bg-teal-50/40"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={item.severity === "blocker" ? "danger" : item.severity === "warning" ? "warning" : "info"}>
                    {item.kind === "approval" && role === "sales" ? "审批处理中" : KIND_LABELS[item.kind] ?? item.kind}
                  </Badge>
                  <span className="truncate font-medium text-slate-800">{item.title}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">{item.subtitle}</div>
              </div>
            </Link>
          ))
        )}
      </CardBody>
    </Card>
  );
}
