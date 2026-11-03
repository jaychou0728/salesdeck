import { useState } from "react";
import { Activity, History } from "lucide-react";
import { useApi, type AuditResponse, type TracesResponse } from "../api/business";
import { useAppStore } from "../state/store";
import { formatDateTime, statusLabel, statusTone } from "../lib/status";
import { PageHeader, Tabs } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

export function Audit() {
  const [tab, setTab] = useState<"traces" | "audit">("traces");
  const { openAudit } = useAppStore();
  const traces = useApi<TracesResponse>("/api/business/traces");
  const audit = useApi<AuditResponse>("/api/business/audit");

  const active = tab === "traces" ? traces : audit;

  return (
    <div>
      <PageHeader
        title="审计"
        description="AI 与手工操作的完整执行链路留痕，可追溯到每一次工具调用"
        actions={
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "traces", label: "执行链路", count: traces.data?.traces.length },
              { value: "audit", label: "审计日志", count: audit.data?.audit.length },
            ]}
          />
        }
      />

      {active.loading && !active.data ? <LoadingBlock /> : null}
      {active.error ? <ErrorBanner message={active.error} onRetry={active.refetch} /> : null}

      {tab === "traces" && traces.data ? (
        traces.data.traces.length === 0 ? (
          <EmptyState title="暂无执行链路" description="在 AI 助手里发起对话后会生成 Trace。" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Trace</TH>
                <TH>操作人</TH>
                <TH>状态</TH>
                <TH>开始时间</TH>
                <TH>结束时间</TH>
                <TH>操作</TH>
              </TR>
            </THead>
            <TBody>
              {traces.data.traces.map((trace) => (
                <TR key={trace.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openAudit({ traceId: trace.id })}>
                  <TD className="font-mono text-[11px] text-slate-700">{trace.id}</TD>
                  <TD>{trace.actorId}</TD>
                  <TD><Badge tone={statusTone(trace.status)}>{statusLabel(trace.status)}</Badge></TD>
                  <TD>{formatDateTime(trace.startedAt)}</TD>
                  <TD>{formatDateTime(trace.endedAt)}</TD>
                  <TD>
                    <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); openAudit({ traceId: trace.id }); }}>
                      <Activity size={13} /> 查看详情
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}

      {tab === "audit" && audit.data ? (
        audit.data.audit.length === 0 ? (
          <EmptyState title="暂无审计日志" description="报价、转订单、审批与库存操作都会写入审计日志。" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>时间</TH>
                <TH>操作人</TH>
                <TH>工具</TH>
                <TH>状态</TH>
                <TH className="text-right">耗时</TH>
                <TH>Trace</TH>
                <TH>操作</TH>
              </TR>
            </THead>
            <TBody>
              {audit.data.audit.map((row) => {
                const hasTrace = Boolean(row.traceId && row.traceId.startsWith("t_"));
                return (
                  <TR key={row.id} className={hasTrace ? "cursor-pointer hover:bg-slate-50" : undefined} onClick={() => { if (hasTrace && row.traceId) openAudit({ traceId: row.traceId }); }}>
                    <TD>{formatDateTime(row.createdAt)}</TD>
                    <TD>{row.actorName ?? row.actorId}</TD>
                    <TD className="font-mono text-[11px] text-slate-700">{row.toolName}</TD>
                    <TD><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></TD>
                    <TD className="text-right tabular-nums">{row.latencyMs}ms</TD>
                    <TD className="max-w-[180px] truncate font-mono text-[10px] text-slate-400">{row.traceId ?? "—"}</TD>
                    <TD>
                      {hasTrace ? (
                        <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); if (row.traceId) openAudit({ traceId: row.traceId }); }}>
                          <History size={13} /> 链路
                        </Button>
                      ) : (
                        <span className="text-[11px] text-slate-400">手工操作</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )
      ) : null}
    </div>
  );
}
