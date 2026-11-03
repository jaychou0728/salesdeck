import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, type OrdersResponse } from "../api/business";
import { useRole } from "../state/store";
import { formatMoney } from "../lib/utils";
import { formatDateTime, statusLabel, statusTone } from "../lib/status";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Select } from "../components/ui/Field";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

const STATUSES = ["pending_approval", "reserved", "fulfilled", "cancelled"];

export function Orders() {
  const navigate = useNavigate();
  const role = useRole();
  const [status, setStatus] = useState("");
  const path = `/api/business/orders${status ? `?status=${status}` : ""}`;
  const { data, loading, error, refetch } = useApi<OrdersResponse>(path);

  return (
    <div>
      <PageHeader
        title="订单"
        description={role === "manager" ? "团队订单与库存预留情况" : "我的订单与库存预留情况"}
        actions={
          <Select aria-label="筛选订单状态" value={status} onChange={(event) => setStatus(event.target.value)} className="w-36">
            <option value="">全部状态</option>
            {STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
          </Select>
        }
      />

      {loading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        data.orders.length === 0 ? (
          <EmptyState title="暂无订单" description="报价转为订单后会出现在这里。" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>订单</TH>
                <TH>客户</TH>
                <TH>负责人</TH>
                <TH>状态</TH>
                <TH className="text-right">金额</TH>
                <TH>支付条款</TH>
                <TH>创建时间</TH>
              </TR>
            </THead>
            <TBody>
              {data.orders.map((order) => (
                <TR key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${order.id}`)}>
                  <TD className="font-medium text-slate-800">{order.orderNo}</TD>
                  <TD>{order.customerName ?? order.customerId}</TD>
                  <TD>{order.ownerName ?? order.ownerId}</TD>
                  <TD><Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge></TD>
                  <TD className="text-right tabular-nums">{formatMoney(order.totalCents)}</TD>
                  <TD>{order.paymentTerms}</TD>
                  <TD>{formatDateTime(order.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}
    </div>
  );
}
