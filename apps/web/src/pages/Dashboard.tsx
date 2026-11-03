import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  CheckSquare,
  FileText,
  Package,
  Plus,
  Users,
  Wrench,
} from "lucide-react";
import { useAppStore, useRole } from "../state/store";
import { useApi, type AlertRow, type DashboardResponse } from "../api/business";
import { formatMoney } from "../lib/utils";
import { statusLabel, statusTone } from "../lib/status";
import { PageHeader, StatCard } from "../components/ui/Page";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

const ALERT_TONE: Record<string, "warning" | "info" | "danger"> = {
  credit_risk: "warning",
  inventory_risk: "warning",
  quote_expiring: "info",
};

const ALERT_LABEL: Record<string, string> = {
  credit_risk: "信用风险",
  inventory_risk: "库存风险",
  quote_expiring: "报价到期",
};

export function Dashboard() {
  const navigate = useNavigate();
  const role = useRole();
  const { openAi } = useAppStore();
  const { data, loading, error, refetch } = useApi<DashboardResponse>("/api/business/dashboard");

  return (
    <div>
      <PageHeader
        title="工作台"
        description={role === "manager" ? "团队销售全局视图与待办审批" : "我的客户、报价与风险提醒"}
        actions={
          <>
            <Button size="sm" onClick={() => navigate("/quotes/new")}>
              <Plus size={14} /> 新建报价
            </Button>
            {role === "manager" ? (
              <Button size="sm" variant="secondary" onClick={() => navigate("/approvals")}>
                <CheckSquare size={14} /> 查看审批
              </Button>
            ) : null}
          </>
        }
      />

      {loading && !data ? <LoadingBlock label="加载工作台…" /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="客户" value={data.metrics.customers} icon={<Users size={15} />} tone="teal" />
            <StatCard label="未结报价" value={data.metrics.openQuotes} icon={<FileText size={15} />} />
            <StatCard label="待审批" value={data.metrics.pendingApprovals} icon={<CheckSquare size={15} />} tone={data.metrics.pendingApprovals > 0 ? "amber" : "slate"} />
            <StatCard label="低库存记录" value={data.metrics.lowStock} icon={<Package size={15} />} tone={data.metrics.lowStock > 0 ? "rose" : "slate"} />
            <StatCard label="未结售后" value={data.metrics.openTickets} icon={<Wrench size={15} />} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="风险提醒" description="来自今日晨报的信用、库存与到期提醒" actions={<span className="text-[11px] text-slate-400">{data.alerts.length} 条</span>} />
              <CardBody className="space-y-2">
                {data.alerts.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">暂无风险提醒</div>
                ) : (
                  data.alerts.map((alert, index) => <AlertItem key={index} alert={alert} />)
                )}
              </CardBody>
            </Card>

            <Card className="self-start">
              <CardHeader title="快速操作" description="常用业务流程入口" />
              <CardBody className="grid grid-cols-2 gap-2">
                <QuickAction label="报价单列表" icon={<FileText size={15} />} onClick={() => navigate("/quotes")} />
                <QuickAction label="查看客户" icon={<Users size={15} />} onClick={() => navigate("/customers")} />
                <QuickAction label="库存检查" icon={<Package size={15} />} onClick={() => navigate("/inventory")} />
                <QuickAction label="智能助手" icon={<Bot size={15} />} onClick={() => openAi()} />
                {role === "manager" ? (
                  <QuickAction label="待办审批" icon={<CheckSquare size={15} />} onClick={() => navigate("/approvals")} />
                ) : (
                  <QuickAction label="售后工单" icon={<Wrench size={15} />} onClick={() => navigate("/tickets")} />
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="最近报价"
                description="按创建时间倒序"
                actions={<Link to="/quotes" className="text-[11px] font-medium text-teal-700 hover:underline">全部报价</Link>}
              />
              <div className="p-3">
                {data.recentQuotes.length === 0 ? (
                  <EmptyState title="暂无报价" description="从新建报价开始。" />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>报价单</TH>
                        <TH>客户</TH>
                        <TH>状态</TH>
                        <TH className="text-right">金额</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.recentQuotes.map((quote) => (
                        <TR key={quote.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/quotes/${quote.id}`)}>
                          <TD className="font-medium text-slate-800">{quote.quoteNo}</TD>
                          <TD>{quote.customerName ?? "—"}</TD>
                          <TD>
                            <Badge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</Badge>
                          </TD>
                          <TD className="text-right tabular-nums">{formatMoney(quote.totalCents)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="最近订单"
                description="按创建时间倒序"
                actions={<Link to="/orders" className="text-[11px] font-medium text-teal-700 hover:underline">全部订单</Link>}
              />
              <div className="p-3">
                {data.recentOrders.length === 0 ? (
                  <EmptyState title="暂无订单" description="批准报价并转订单后会出现在这里。" />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>订单</TH>
                        <TH>客户</TH>
                        <TH>状态</TH>
                        <TH className="text-right">金额</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.recentOrders.map((order) => (
                        <TR key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${order.id}`)}>
                          <TD className="font-medium text-slate-800">{order.orderNo}</TD>
                          <TD>{order.customerName ?? "—"}</TD>
                          <TD>
                            <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                          </TD>
                          <TD className="text-right tabular-nums">{formatMoney(order.totalCents)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AlertItem({ alert }: { alert: AlertRow }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className={alert.severity === "info" ? "mt-0.5 text-sky-500" : "mt-0.5 text-amber-500"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={ALERT_TONE[alert.type] ?? "neutral"}>{ALERT_LABEL[alert.type] ?? alert.type}</Badge>
            {alert.entityRef?.name ? <span className="truncate text-xs font-medium text-slate-700">{alert.entityRef.name}</span> : null}
          </div>
          <div className="mt-1 text-[11px] text-slate-600">{alert.why}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">建议：{alert.suggestedAction}</div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
    >
      <span className="rounded-md bg-slate-100 p-1.5 text-slate-600">{icon}</span>
      {label}
    </button>
  );
}
