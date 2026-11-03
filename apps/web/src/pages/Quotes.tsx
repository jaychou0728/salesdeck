import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useApi, type QuotesResponse } from "../api/business";
import { useRole } from "../state/store";
import { formatMoney } from "../lib/utils";
import { formatDate, statusLabel, statusTone } from "../lib/status";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Field";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

const STATUSES = ["draft", "pending_approval", "approved", "rejected", "converted", "expired", "cancelled"];

export function Quotes() {
  const navigate = useNavigate();
  const role = useRole();
  const [status, setStatus] = useState("");
  const path = `/api/business/quotes${status ? `?status=${status}` : ""}`;
  const { data, loading, error, refetch } = useApi<QuotesResponse>(path);

  return (
    <div>
      <PageHeader
        title="报价"
        description={role === "manager" ? "团队报价单与审批状态" : "我的报价单与审批状态"}
        actions={
          <>
            <Select aria-label="筛选报价状态" value={status} onChange={(event) => setStatus(event.target.value)} className="w-36">
              <option value="">全部状态</option>
              {STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
            </Select>
            <Button size="sm" onClick={() => navigate("/quotes/new")}>
              <Plus size={14} /> 新建报价
            </Button>
          </>
        }
      />

      {loading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        data.quotes.length === 0 ? (
          <EmptyState
            title="暂无报价"
            description="可以使用 AI 助手或手动表单创建第一张报价单。"
            action={<Button size="sm" onClick={() => navigate("/quotes/new")}>新建报价</Button>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>报价单</TH>
                <TH>客户</TH>
                <TH>负责人</TH>
                <TH>状态</TH>
                <TH className="text-right">金额</TH>
                <TH>有效期至</TH>
              </TR>
            </THead>
            <TBody>
              {data.quotes.map((quote) => (
                <TR key={quote.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/quotes/${quote.id}`)}>
                  <TD className="font-medium text-slate-800">{quote.quoteNo}</TD>
                  <TD>{quote.customerName ?? quote.customerId}</TD>
                  <TD>{quote.ownerName ?? quote.ownerId}</TD>
                  <TD><Badge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</Badge></TD>
                  <TD className="text-right tabular-nums">{formatMoney(quote.totalCents)}</TD>
                  <TD>{formatDate(quote.validUntil)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}
    </div>
  );
}
