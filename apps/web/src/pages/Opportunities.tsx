import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi, type OpportunitiesResponse } from "../api/business";
import { formatMoney } from "../lib/utils";
import { formatDate } from "../lib/status";
import { RISK_LABELS, STAGE_LABELS, priorityTone, riskTone, stageTone } from "../lib/opportunity";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Select } from "../components/ui/Field";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

const STAGES = ["lead", "needs", "solution", "quote", "negotiation", "won", "lost"];

export function Opportunities() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState(searchParams.get("stage") ?? "");
  const [risk, setRisk] = useState(searchParams.get("risk") ?? "");
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  if (risk) params.set("risk", risk);
  const { data, loading, error, refetch } = useApi<OpportunitiesResponse>(
    `/api/business/opportunities${params.toString() ? `?${params.toString()}` : ""}`,
  );

  return (
    <div>
      <PageHeader
        title="商机"
        description="一个客户可以有多个商机；按阶段、风险与金额查看"
        actions={
          <>
            <Select aria-label="筛选阶段" value={stage} onChange={(event) => setStage(event.target.value)} className="w-32">
              <option value="">全部阶段</option>
              {STAGES.map((value) => (
                <option key={value} value={value}>{STAGE_LABELS[value] ?? value}</option>
              ))}
            </Select>
            <Select aria-label="筛选风险" value={risk} onChange={(event) => setRisk(event.target.value)} className="w-32">
              <option value="">全部风险</option>
              <option value="high">高风险</option>
              <option value="medium">中风险</option>
              <option value="low">低风险</option>
            </Select>
          </>
        }
      />

      {loading && !data ? <LoadingBlock label="加载商机…" /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        data.opportunities.length === 0 ? (
          <EmptyState title="暂无商机" description="调整筛选条件，或从客户页面创建商机。" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>客户 / 商机</TH>
                <TH>阶段</TH>
                <TH>优先级</TH>
                <TH>风险</TH>
                <TH className="text-right">金额</TH>
                <TH>下一步</TH>
                <TH>负责人</TH>
              </TR>
            </THead>
            <TBody>
              {data.opportunities.map((row) => (
                <TR key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/opportunities/${row.id}`)}>
                  <TD>
                    <div className="font-medium text-slate-800">{row.customerName}</div>
                    <div className="text-[11px] text-slate-500">{row.name}</div>
                  </TD>
                  <TD><Badge tone={stageTone(row.stage)}>{STAGE_LABELS[row.stage] ?? row.stage}</Badge></TD>
                  <TD>{row.priority ? <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge> : "—"}</TD>
                  <TD><Badge tone={riskTone(row.riskLevel)}>{RISK_LABELS[row.riskLevel]}</Badge></TD>
                  <TD className="text-right tabular-nums">{formatMoney(row.amountCents)}</TD>
                  <TD className="max-w-[220px] truncate">
                    {row.nextAction ?? "—"}
                    {row.nextActionDueAt ? ` · ${formatDate(row.nextActionDueAt)}` : ""}
                  </TD>
                  <TD>{row.ownerName ?? row.ownerId}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}
    </div>
  );
}
