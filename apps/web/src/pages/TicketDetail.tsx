import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Wrench } from "lucide-react";
import { useApi, type TicketDetailResponse } from "../api/business";
import { formatDateTime, statusLabel, statusTone } from "../lib/status";
import { PageHeader } from "../components/ui/Page";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { ErrorBanner, LoadingBlock } from "../components/ui/Feedback";

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApi<TicketDetailResponse>(id ? `/api/business/tickets/${id}` : null);

  if (loading && !data) return <LoadingBlock label="加载工单…" />;
  if (error) return <ErrorBanner message={error} onRetry={refetch} />;
  if (!data) return null;

  const { ticket, customer, order, product } = data;

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate("/tickets")} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft size={13} /> 返回售后列表
      </button>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Wrench size={18} className="text-slate-400" />
            {ticket.ticketNo}
            <Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge>
          </span>
        }
        description={`${ticket.issueType} · 创建于 ${formatDateTime(ticket.createdAt)}`}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="问题描述" />
          <CardBody className="space-y-3 text-xs">
            <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{ticket.description}</p>
            <div className="grid grid-cols-2 gap-2">
              <Info label="客户" value={customer ? customer.name : ticket.customerId} />
              <Info label="产品" value={product ? `${product.sku} · ${product.name}` : ticket.productId} />
              <Info label="序列号" value={ticket.serialNo ?? "—"} />
              <Info label="状态" value={statusLabel(ticket.status)} />
            </div>
            {ticket.resolution ? (
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800">处理结果：{ticket.resolution}</div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="关联信息" />
          <CardBody className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">客户</span>
              {customer ? <Link to={`/customers/${customer.id}`} className="text-teal-700 hover:underline">{customer.name}</Link> : <span>—</span>}
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">订单</span>
              {order ? <Link to={`/orders/${order.id}`} className="text-teal-700 hover:underline">{order.orderNo}</Link> : <span>—</span>}
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">产品</span>
              <span>{product?.sku ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">政策引用</span>
              <span className="max-w-[60%] truncate text-right">{ticket.policyRefs}</span>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 font-medium text-slate-800">{value}</div>
    </div>
  );
}
