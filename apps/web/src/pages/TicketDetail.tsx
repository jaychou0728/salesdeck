import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Play, Wrench } from "lucide-react";
import { apiPatch, errorMessage, useApi, type TicketDetailResponse } from "../api/business";
import { useAppStore } from "../state/store";
import { formatDateTime, statusLabel, statusTone } from "../lib/status";
import { PageHeader } from "../components/ui/Page";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { ErrorBanner, LoadingBlock } from "../components/ui/Feedback";

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pushToast, bumpData } = useAppStore();
  const { data, loading, error, refetch } = useApi<TicketDetailResponse>(id ? `/api/business/tickets/${id}` : null);
  const [working, setWorking] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <LoadingBlock label="加载工单…" />;
  if (error) return <ErrorBanner message={error} onRetry={refetch} />;
  if (!data) return null;

  const { ticket, customer, order, product } = data;

  async function updateTicket(payload: { status?: string; resolution?: string }) {
    if (!id) return;
    setWorking(true);
    setActionError(null);
    try {
      await apiPatch(`/api/business/tickets/${id}`, payload);
      pushToast(payload.status === "resolved" ? "工单已解决" : payload.status === "closed" ? "工单已关闭" : "工单状态已更新", "success");
      bumpData();
      setResolveOpen(false);
      setResolution("");
      refetch();
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  const canStart = ticket.status === "open";
  const canResolve = ticket.status === "open" || ticket.status === "processing";
  const canClose = ticket.status === "resolved";

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
        actions={
          <>
            {canStart ? (
              <Button size="sm" variant="secondary" onClick={() => updateTicket({ status: "processing" })} disabled={working}>
                <Play size={14} /> 开始处理
              </Button>
            ) : null}
            {canResolve ? (
              <Button size="sm" onClick={() => setResolveOpen(true)} disabled={working}>
                <CheckCircle2 size={14} /> 标记已解决
              </Button>
            ) : null}
            {canClose ? (
              <Button size="sm" variant="secondary" onClick={() => updateTicket({ status: "closed" })} disabled={working}>
                关闭工单
              </Button>
            ) : null}
          </>
        }
      />

      {actionError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">{actionError}</div> : null}

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

      <Modal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title="填写处理结果"
        description="解决工单前必须记录处理结果，便于后续追溯与客户回访"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setResolveOpen(false)}>取消</Button>
            <Button size="sm" onClick={() => updateTicket({ status: "resolved", resolution: resolution.trim() })} disabled={working || resolution.trim().length < 2}>
              {working ? "提交中…" : "确认解决"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {ticket.resolution ? (
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">当前记录：{ticket.resolution}</div>
          ) : null}
          <Field label="处理结果" htmlFor="ticket-resolution">
            <Textarea
              id="ticket-resolution"
              aria-label="处理结果"
              rows={4}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder="例如：已安排换机，物流单号 SF123456，客户确认收货"
            />
          </Field>
        </div>
      </Modal>
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
