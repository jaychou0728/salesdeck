import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { useApi, type OrderDetailResponse } from "../api/business";
import { formatMoney } from "../lib/utils";
import { formatDateTime, statusLabel, statusTone } from "../lib/status";
import { PageHeader } from "../components/ui/Page";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApi<OrderDetailResponse>(id ? `/api/business/orders/${id}` : null);

  if (loading && !data) return <LoadingBlock label="加载订单详情…" />;
  if (error) return <ErrorBanner message={error} onRetry={refetch} />;
  if (!data) return null;

  const { order, customer, lines, reservations } = data;

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate("/orders")} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft size={13} /> 返回订单列表
      </button>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-slate-400" />
            {order.orderNo}
            <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
          </span>
        }
        description={
          customer ? (
            <span>
              客户 <Link to={`/customers/${customer.id}`} className="text-teal-700 hover:underline">{customer.name}</Link> · {order.paymentTerms} · 负责人 {order.ownerName ?? order.ownerId}
            </span>
          ) : undefined
        }
      />

      {order.opportunityId ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
          所属商机
          <Link to={`/opportunities/${order.opportunityId}`} className="font-medium text-teal-700 hover:underline">
            查看商机
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="订单明细" description={`关联报价 ${order.quoteId}`} />
          <div className="p-3">
            <Table>
              <THead>
                <TR>
                  <TH>SKU / 产品</TH>
                  <TH className="text-right">数量</TH>
                  <TH className="text-right">单价</TH>
                  <TH className="text-right">小计</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((line) => (
                  <TR key={line.id}>
                    <TD>
                      <div className="font-medium text-slate-800">{line.sku ?? line.productId}</div>
                      <div className="text-[11px] text-slate-400">{line.productName}</div>
                    </TD>
                    <TD className="text-right tabular-nums">{line.quantity}</TD>
                    <TD className="text-right tabular-nums">{formatMoney(line.unitPriceCents)}</TD>
                    <TD className="text-right tabular-nums">{formatMoney(line.unitPriceCents * line.quantity)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>

        <Card>
          <CardHeader title="订单信息" />
          <CardBody className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-400">订单金额</span><span className="font-semibold tabular-nums text-slate-900">{formatMoney(order.totalCents)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">报价单</span><Link className="text-teal-700 hover:underline" to={`/quotes/${order.quoteId}`}>{order.quoteId}</Link></div>
            <div className="flex justify-between"><span className="text-slate-400">支付条款</span><span>{order.paymentTerms}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">创建时间</span><span>{formatDateTime(order.createdAt)}</span></div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="库存预留" description={`${reservations.length} 条预留记录`} />
        <div className="p-3">
          <Table>
            <THead>
              <TR>
                <TH>仓库</TH>
                <TH>产品</TH>
                <TH className="text-right">数量</TH>
                <TH>状态</TH>
              </TR>
            </THead>
            <TBody>
              {reservations.map((reservation) => (
                <TR key={reservation.id}>
                  <TD>{reservation.warehouseName ?? reservation.warehouseId}</TD>
                  <TD>{reservation.productId}</TD>
                  <TD className="text-right tabular-nums">{reservation.quantity}</TD>
                  <TD><Badge tone={statusTone(reservation.status)}>{statusLabel(reservation.status)}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
