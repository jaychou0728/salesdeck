import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, FileText, Target, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import type { PriorityItem } from "@salespilot/shared";
import { useAppStore, useRole } from "../state/store";
import { useApi, type WorkspaceResponse } from "../api/business";
import { formatMoney } from "../lib/utils";
import { statusLabel, statusTone } from "../lib/status";
import { PageHeader, StatCard } from "../components/ui/Page";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { PriorityCard } from "../components/PriorityCard";
import { TodoPanel } from "../components/TodoPanel";
import { FollowUpModal } from "../components/FollowUpModal";

export function Dashboard() {
  const navigate = useNavigate();
  const role = useRole();
  const { openAi, queuePrompt } = useAppStore();
  const { data, loading, error, refetch } = useApi<WorkspaceResponse>("/api/business/workspace");
  const [followUpTarget, setFollowUpTarget] = useState<PriorityItem | null>(null);

  function askAi(item: PriorityItem) {
    openAi(`正在推进 ${item.customerName} · ${item.name}`);
    queuePrompt(`帮我推进${item.customerName}`);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={role === "manager" ? "团队作战室" : "今日作战室"}
        description={
          role === "manager"
            ? "团队销售全局、风险商机与待审批"
            : `${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })} · 先处理最值得推进的客户`
        }
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => navigate("/opportunities")}>
              <Target size={14} /> 查看商机
            </Button>
            <Button size="sm" onClick={() => navigate("/quotes/new")}>
              <FileText size={14} /> 新建报价
            </Button>
          </>
        }
      />

      {loading && !data ? <LoadingBlock label="正在计算今日优先级…" /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="本月销售额" value={formatMoney(data.metrics.monthSalesCents)} icon={<Wallet size={15} />} tone="teal" />
            <StatCard
              label={role === "manager" ? "团队目标完成率" : "本月目标完成率"}
              value={`${Math.round(data.metrics.completionRate * 100)}%`}
              hint={`目标 ${formatMoney(data.metrics.monthTargetCents)}`}
              icon={<Target size={15} />}
              tone={data.metrics.completionRate >= 0.8 ? "teal" : data.metrics.completionRate >= 0.5 ? "amber" : "rose"}
            />
            <StatCard
              label="加权预计成交"
              value={formatMoney(data.metrics.expectedCloseCents)}
              hint="按成交概率加权"
              icon={<TrendingUp size={15} />}
            />
            <StatCard label="进行中商机" value={data.metrics.activeOpportunities} icon={<Users size={15} />} />
            <StatCard
              label="高风险商机"
              value={data.metrics.highRiskOpportunities}
              icon={<TrendingDown size={15} />}
              tone={data.metrics.highRiskOpportunities > 0 ? "rose" : "slate"}
            />
          </div>

          <Card className="border-teal-100">
            <CardHeader
              title={
                <span className="flex items-center gap-1.5">
                  <Bot size={15} className="text-teal-700" /> AI 今日建议
                </span>
              }
              description={data.headline}
              actions={<span className="text-[11px] text-slate-400">按金额 × 概率 × 紧迫度 × 风险排序</span>}
            />
            <CardBody className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {data.priorities.length === 0 ? (
                <EmptyState title="今天没有需要紧急推进的商机" description="可以整理客户资料或开发新线索。" />
              ) : (
                data.priorities.map((item) => (
                  <PriorityCard
                    key={item.opportunityId}
                    item={item}
                    onAskAI={askAi}
                    onLogFollowUp={setFollowUpTarget}
                    showOwner={role === "manager"}
                  />
                ))
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TodoPanel groups={data.todos} />

            <Card>
              <CardHeader
                title="风险商机"
                description="高风险或 P0 商机"
                actions={<Link to="/opportunities?risk=high" className="text-[11px] font-medium text-teal-700 hover:underline">全部商机</Link>}
              />
              <CardBody className="space-y-2">
                {data.risks.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">暂无高风险商机</div>
                ) : (
                  data.risks.map((item) => (
                    <Link
                      key={item.opportunityId}
                      to={`/opportunities/${item.opportunityId}`}
                      className="block rounded-lg border border-slate-200 p-2.5 text-xs hover:border-rose-200 hover:bg-rose-50/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{item.customerName} · {item.name}</span>
                        <span className="tabular-nums text-slate-700">{formatMoney(item.amountCents)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{item.reasons.slice(0, 2).join("；")}</div>
                    </Link>
                  ))
                )}
              </CardBody>
            </Card>
          </div>

          {role === "manager" && data.ranking ? (
            <Card>
              <CardHeader title="销售排行" description="本月销售额与管道金额" actions={<Badge tone="teal">团队</Badge>} />
              <div className="p-3">
                <Table>
                  <THead>
                    <TR>
                      <TH>销售</TH>
                      <TH className="text-right">本月销售额</TH>
                      <TH className="text-right">管道金额</TH>
                      <TH className="text-right">目标完成率</TH>
                      <TH>目标达成</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.ranking.map((row) => (
                      <TR key={row.ownerId}>
                        <TD className="font-medium text-slate-800">{row.ownerName}</TD>
                        <TD className="text-right tabular-nums">{formatMoney(row.monthSalesCents)}</TD>
                        <TD className="text-right tabular-nums">{formatMoney(row.pipelineCents)}</TD>
                        <TD className="text-right tabular-nums">{Math.round(row.completionRate * 100)}%</TD>
                        <TD>
                          <Badge tone={row.trend === "up" ? "success" : row.trend === "flat" ? "warning" : "danger"}>
                            {row.trend === "up" ? "达成" : row.trend === "flat" ? "接近" : "落后"}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="最近报价" actions={<Link to="/quotes" className="text-[11px] font-medium text-teal-700 hover:underline">全部报价</Link>} />
              <div className="p-3">
                {data.recentQuotes.length === 0 ? (
                  <EmptyState title="暂无报价" />
                ) : (
                  <Table>
                    <THead>
                      <TR><TH>报价单</TH><TH>客户</TH><TH>状态</TH><TH className="text-right">金额</TH></TR>
                    </THead>
                    <TBody>
                      {data.recentQuotes.map((quote) => (
                        <TR key={quote.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/quotes/${quote.id}`)}>
                          <TD className="font-medium text-slate-800">{quote.quoteNo}</TD>
                          <TD>{quote.customerName ?? "—"}</TD>
                          <TD><Badge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</Badge></TD>
                          <TD className="text-right tabular-nums">{formatMoney(quote.totalCents)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="最近订单" description="按创建时间倒序" actions={<Link to="/orders" className="text-[11px] font-medium text-teal-700 hover:underline">全部订单</Link>} />
              <div className="p-3">
                {data.recentOrders.length === 0 ? (
                  <EmptyState title="暂无订单" />
                ) : (
                  <Table>
                    <THead>
                      <TR><TH>订单</TH><TH>客户</TH><TH>状态</TH><TH className="text-right">金额</TH></TR>
                    </THead>
                    <TBody>
                      {data.recentOrders.map((order) => (
                        <TR key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${order.id}`)}>
                          <TD className="font-medium text-slate-800">{order.orderNo}</TD>
                          <TD>{order.customerName ?? "—"}</TD>
                          <TD><Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge></TD>
                          <TD className="text-right tabular-nums">{formatMoney(order.totalCents)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {followUpTarget ? (
        <FollowUpModal
          open={Boolean(followUpTarget)}
          onClose={() => setFollowUpTarget(null)}
          customerId={followUpTarget.customerId}
          opportunityId={followUpTarget.opportunityId}
          onSaved={refetch}
        />
      ) : null}
    </div>
  );
}
