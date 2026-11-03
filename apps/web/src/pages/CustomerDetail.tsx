import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, CheckSquare, Plus } from "lucide-react";
import { useApi, type CustomerDetailResponse } from "../api/business";
import { useAppStore } from "../state/store";
import { formatMoney } from "../lib/utils";
import { formatDate, formatDateTime, formatPercent, statusLabel, statusTone } from "../lib/status";
import { PageHeader } from "../components/ui/Page";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { CreditBar } from "../components/ui/Field";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

const LEVEL_TONE = { A: "teal", B: "info", C: "neutral" } as const;

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openAi, queuePrompt } = useAppStore();
  const { data, loading, error, refetch } = useApi<CustomerDetailResponse>(id ? `/api/business/customers/${id}` : null);

  if (loading && !data) return <LoadingBlock label="加载客户 360…" />;
  if (error) return <ErrorBanner message={error} onRetry={refetch} />;
  if (!data) return null;

  const { customer, contacts, credit, quotes, orders, tickets } = data;

  function askAi() {
    openAi(`正在为客户「${customer.name}」报价`);
    queuePrompt(`给${customer.name}报价，先查库存和信用`);
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate("/customers")} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft size={13} /> 返回客户列表
      </button>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {customer.name}
            <Badge tone={LEVEL_TONE[customer.level] ?? "neutral"}>{customer.level} 级</Badge>
            <Badge tone={customer.status === "active" ? "success" : "neutral"}>{customer.status === "active" ? "合作中" : customer.status}</Badge>
          </span>
        }
        description={`${customer.industry} · ${customer.region} · 负责人 ${customer.ownerName ?? customer.ownerId} · ${customer.paymentTerms}`}
        actions={
          <>
            <Button size="sm" onClick={() => navigate(`/quotes/new?customerId=${customer.id}`)}>
              <Plus size={14} /> 新建报价
            </Button>
            <Button size="sm" variant="secondary" onClick={askAi}>
              <Bot size={14} /> 让 AI 报价
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate("/approvals")}>
              <CheckSquare size={14} /> 查看审批
            </Button>
          </>
        }
      />

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
                    <TD>
                      <Badge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</Badge>
                    </TD>
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
                  <TR>
                    <TH>订单</TH>
                    <TH>状态</TH>
                    <TH>创建时间</TH>
                    <TH className="text-right">金额</TH>
                  </TR>
                </THead>
                <TBody>
                  {orders.map((order) => (
                    <TR key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${order.id}`)}>
                      <TD className="font-medium text-slate-800">{order.orderNo}</TD>
                      <TD>
                        <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                      </TD>
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
                  <TR>
                    <TH>工单</TH>
                    <TH>类型</TH>
                    <TH>状态</TH>
                    <TH>创建时间</TH>
                  </TR>
                </THead>
                <TBody>
                  {tickets.map((ticket) => (
                    <TR key={ticket.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                      <TD className="font-medium text-slate-800">{ticket.ticketNo}</TD>
                      <TD>{ticket.issueType}</TD>
                      <TD>
                        <Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                      </TD>
                      <TD>{formatDateTime(ticket.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
