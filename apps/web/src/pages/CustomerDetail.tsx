import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, ClipboardList, Plus } from "lucide-react";
import { useApi, type CustomerDetailResponse } from "../api/business";
import { useAppStore } from "../state/store";
import { formatMoney } from "../lib/utils";
import { formatDate, formatDateTime, formatPercent, statusLabel, statusTone } from "../lib/status";
import { FOLLOW_UP_TYPE_LABELS, RISK_LABELS, STAGE_LABELS, riskTone, stageTone } from "../lib/opportunity";
import { PageHeader } from "../components/ui/Page";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { CreditBar } from "../components/ui/Field";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { AIAssessmentCard } from "../components/AIAssessmentCard";
import { FollowUpModal } from "../components/FollowUpModal";
import { NewOpportunityModal } from "../components/NewOpportunityModal";

const LEVEL_TONE = { A: "teal", B: "info", C: "neutral" } as const;

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openAi, queuePrompt } = useAppStore();
  const { data, loading, error, refetch } = useApi<CustomerDetailResponse>(id ? `/api/business/customers/${id}` : null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpOpportunityId, setFollowUpOpportunityId] = useState<string | undefined>();
  const [newOpportunityOpen, setNewOpportunityOpen] = useState(false);

  if (loading && !data) return <LoadingBlock label="加载客户 360…" />;
  if (error) return <ErrorBanner message={error} onRetry={refetch} />;
  if (!data) return null;

  const { customer, contacts, credit, quotes, orders, tickets, opportunities, followUps, assessment } = data;
  const activeOpportunities = opportunities.filter((item) => item.priority !== null);

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate("/customers")} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft size={13} /> 返回客户列表
      </button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {customer.name}
            <Badge tone={LEVEL_TONE[customer.level] ?? "neutral"}>{customer.level} 级</Badge>
            <Badge tone={customer.status === "active" ? "success" : "neutral"}>{customer.status === "active" ? "合作中" : customer.status}</Badge>
            <span className="text-[11px] font-normal text-slate-400">客户推进中心</span>
          </span>
        }
        description={`${customer.industry} · ${customer.region} · 负责人 ${customer.ownerName ?? customer.ownerId} · ${customer.paymentTerms}`}
        actions={
          <>
            <Button size="sm" onClick={() => navigate(`/quotes/new?customerId=${customer.id}`)}>
              <Plus size={14} /> 新建报价
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setNewOpportunityOpen(true)}>
              <Plus size={14} /> 新建商机
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                openAi(`正在推进 ${customer.name}`);
                queuePrompt(`帮我推进${customer.name}`);
              }}
            >
              <Bot size={14} /> 让 AI 帮我推进
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setFollowUpOpportunityId(activeOpportunities[0]?.id);
                setFollowUpOpen(true);
              }}
            >
              <ClipboardList size={14} /> 记录跟进
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="当前商机"
            description={`${activeOpportunities.length} 个进行中商机`}
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => navigate("/opportunities")}>全部商机</Button>
                <Button size="sm" variant="secondary" onClick={() => setNewOpportunityOpen(true)}>新建商机</Button>
              </>
            }
          />
          <CardBody className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-50 p-2 text-xs">
                <div className="text-slate-400">商机总额</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-800">
                  {formatMoney(activeOpportunities.reduce((sum, item) => sum + item.amountCents, 0))}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-xs">
                <div className="text-slate-400">历史订单</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-800">
                  {formatMoney(orders.reduce((sum, order) => sum + order.totalCents, 0))}
                </div>
              </div>
            </div>

            {activeOpportunities.length === 0 ? (
              <EmptyState
                title="暂无进行中商机"
                description="为该客户创建第一个商机，开始跟踪金额、阶段和下一步。"
                action={<Button size="sm" onClick={() => setNewOpportunityOpen(true)}>新建商机</Button>}
              />
            ) : (
              activeOpportunities.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-900">{item.name}</span>
                        <Badge tone={stageTone(item.stage)}>{STAGE_LABELS[item.stage] ?? item.stage}</Badge>
                        <Badge tone={riskTone(item.riskLevel)}>{RISK_LABELS[item.riskLevel]}</Badge>
                        {item.priority ? (
                          <Badge tone={item.priority === "P0" ? "danger" : item.priority === "P1" ? "warning" : "neutral"}>{item.priority}</Badge>
                        ) : null}
                        {item.riskLevel === "high" && item.reasons.some((reason) => reason.includes("信用已用")) ? (
                          <span title="该风险来自客户信用额度，可能影响该客户的多个商机">
                            <Badge tone="warning">客户级风险</Badge>
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatMoney(item.amountCents)} · 成交概率 {item.probability}%
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/opportunities/${item.id}`)}>查看商机</Button>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    下一步：{item.nextAction ?? "未设置"}
                    {item.nextActionDueAt ? ` · 截止 ${formatDateTime(item.nextActionDueAt)}` : ""}
                  </div>
                  {item.suggestedAction ? <div className="mt-1 text-[11px] text-teal-800">建议：{item.suggestedAction}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setFollowUpOpportunityId(item.id);
                        setFollowUpOpen(true);
                      }}
                    >
                      记录跟进
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/quotes/new?customerId=${customer.id}&opportunityId=${item.id}`)}>
                      新建报价
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        openAi(`正在推进 ${customer.name} · ${item.name}`);
                        queuePrompt(`帮我推进${customer.name}`);
                      }}
                    >
                      让 AI 推进
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <AIAssessmentCard assessment={assessment} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="信用额度" description="信用使用情况实时来自客户主数据" />
          <CardBody className="space-y-3">
            <div className="flex items-end justify-between">
              <div className="text-2xl font-semibold tabular-nums text-slate-900">{formatPercent(credit.utilization)}</div>
              <div className="text-xs text-slate-500">
                可用 <span className="font-medium text-slate-800">{formatMoney(credit.availableCents)}</span>
              </div>
            </div>
            <CreditBar utilization={credit.utilization} className="h-2" />
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-slate-400">额度</div>
                <div className="mt-0.5 font-medium tabular-nums text-slate-800">{formatMoney(credit.limitCents)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-slate-400">已用</div>
                <div className="mt-0.5 font-medium tabular-nums text-slate-800">{formatMoney(credit.usedCents)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-slate-400">可用</div>
                <div className="mt-0.5 font-medium tabular-nums text-slate-800">{formatMoney(credit.availableCents)}</div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="联系人" description={`${contacts.length} 位`} />
          <CardBody className="space-y-2">
            {contacts.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">暂无联系人</div>
            ) : (
              contacts.map((contact) => (
                <div key={contact.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{contact.name}</span>
                    {contact.isPrimary ? <Badge tone="teal">主要</Badge> : null}
                  </div>
                  <div className="mt-0.5 text-slate-500">{contact.title}</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {contact.phone} · {contact.email}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="跟进时间线"
          description={`${followUps.length} 条记录`}
          actions={<Button size="sm" variant="ghost" onClick={() => setFollowUpOpen(true)}>记录跟进</Button>}
        />
        <CardBody className="space-y-2">
          {followUps.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">暂无跟进记录</div>
          ) : (
            followUps.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{FOLLOW_UP_TYPE_LABELS[item.type] ?? item.type} · {item.content}</span>
                  <span className="text-[11px] text-slate-400">{formatDateTime(item.createdAt)}</span>
                </div>
                {item.result ? <div className="mt-1 text-slate-600">结果：{item.result}</div> : null}
                {item.nextAction ? (
                  <div className="mt-1 text-slate-500">
                    下一步：{item.nextAction}
                    {item.nextActionDueAt ? ` · ${formatDateTime(item.nextActionDueAt)}` : ""}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="最近报价" actions={<Button size="sm" variant="ghost" onClick={() => navigate("/quotes")}>全部报价</Button>} />
        <div className="p-3">
          {quotes.length === 0 ? (
            <EmptyState title="暂无报价" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>报价单</TH>
                  <TH>状态</TH>
                  <TH>有效期至</TH>
                  <TH className="text-right">金额</TH>
                </TR>
              </THead>
              <TBody>
                {quotes.map((quote) => (
                  <TR key={quote.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/quotes/${quote.id}`)}>
                    <TD className="font-medium text-slate-800">{quote.quoteNo}</TD>
                    <TD><Badge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</Badge></TD>
                    <TD>{formatDate(quote.validUntil)}</TD>
                    <TD className="text-right tabular-nums">{formatMoney(quote.totalCents)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="最近订单" actions={<Button size="sm" variant="ghost" onClick={() => navigate("/orders")}>全部订单</Button>} />
          <div className="p-3">
            {orders.length === 0 ? (
              <EmptyState title="暂无订单" />
            ) : (
              <Table>
                <THead>
                  <TR><TH>订单</TH><TH>状态</TH><TH>创建时间</TH><TH className="text-right">金额</TH></TR>
                </THead>
                <TBody>
                  {orders.map((order) => (
                    <TR key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${order.id}`)}>
                      <TD className="font-medium text-slate-800">{order.orderNo}</TD>
                      <TD><Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge></TD>
                      <TD>{formatDateTime(order.createdAt)}</TD>
                      <TD className="text-right tabular-nums">{formatMoney(order.totalCents)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="最近售后" actions={<Button size="sm" variant="ghost" onClick={() => navigate("/tickets")}>全部工单</Button>} />
          <div className="p-3">
            {tickets.length === 0 ? (
              <EmptyState title="暂无售后工单" />
            ) : (
              <Table>
                <THead>
                  <TR><TH>工单</TH><TH>类型</TH><TH>状态</TH><TH>创建时间</TH></TR>
                </THead>
                <TBody>
                  {tickets.map((ticket) => (
                    <TR key={ticket.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                      <TD className="font-medium text-slate-800">{ticket.ticketNo}</TD>
                      <TD>{ticket.issueType}</TD>
                      <TD><Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge></TD>
                      <TD>{formatDateTime(ticket.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
      </div>

      <FollowUpModal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        customerId={customer.id}
        opportunityId={followUpOpportunityId}
        onSaved={refetch}
      />

      <NewOpportunityModal
        open={newOpportunityOpen}
        onClose={() => setNewOpportunityOpen(false)}
        initialCustomerId={customer.id}
        onCreated={refetch}
      />
    </div>
  );
}
