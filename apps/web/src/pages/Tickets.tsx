import { useNavigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { useApi, type TicketsResponse } from "../api/business";
import { useAppStore, useRole } from "../state/store";
import { formatDateTime, statusLabel, statusTone } from "../lib/status";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

const ISSUE_LABEL: Record<string, string> = { DOA: "开箱故障", repair: "维修", return: "退货" };

export function Tickets() {
  const navigate = useNavigate();
  const role = useRole();
  const { openAi, queuePrompt } = useAppStore();
  const { data, loading, error, refetch } = useApi<TicketsResponse>("/api/business/tickets");

  function askAi() {
    openAi("正在为客户创建售后工单");
    queuePrompt("华辰设备开不了机，帮我建售后工单");
  }

  return (
    <div>
      <PageHeader
        title="售后"
        description={role === "manager" ? "团队售后工单与处理进度" : "我的客户售后工单与处理进度"}
        actions={
          <Button size="sm" onClick={askAi}>
            <Bot size={14} /> 让 AI 建工单
          </Button>
        }
      />

      {loading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        data.tickets.length === 0 ? (
          <EmptyState
            title="暂无售后工单"
            description="点击右上角「让 AI 建工单」，或从客户详情发起售后流程。"
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>工单</TH>
                <TH>客户</TH>
                <TH>产品</TH>
                <TH>问题类型</TH>
                <TH>状态</TH>
                <TH>创建时间</TH>
              </TR>
            </THead>
            <TBody>
              {data.tickets.map((ticket) => (
                <TR key={ticket.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                  <TD className="font-medium text-slate-800">{ticket.ticketNo}</TD>
                  <TD>{ticket.customerName ?? ticket.customerId}</TD>
                  <TD>{ticket.productName ?? ticket.productId}</TD>
                  <TD>{ISSUE_LABEL[ticket.issueType] ?? ticket.issueType}</TD>
                  <TD><Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge></TD>
                  <TD>{formatDateTime(ticket.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}
    </div>
  );
}
