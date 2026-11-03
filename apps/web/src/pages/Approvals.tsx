import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Lock } from "lucide-react";
import {
  apiPost,
  errorMessage,
  useApi,
  type ApprovalDecisionResponse,
  type ApprovalRow,
  type ApprovalsResponse,
} from "../api/business";
import { useAppStore, useRole } from "../state/store";
import { formatMoney } from "../lib/utils";
import { formatDateTime, statusLabel, statusTone } from "../lib/status";
import { PageHeader, Tabs } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Textarea } from "../components/ui/Field";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { Card, CardBody } from "../components/ui/Card";

const TYPE_LABEL: Record<string, string> = {
  order_conversion: "转订单审批",
  quote_price: "报价底线审批",
};

export function Approvals() {
  const role = useRole();
  const navigate = useNavigate();
  const { bumpData, pushToast } = useAppStore();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [selected, setSelected] = useState<ApprovalRow | null>(null);
  const [comment, setComment] = useState("");
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const { data, loading, error, refetch } = useApi<ApprovalsResponse>(role === "manager" ? "/api/business/approvals" : null);

  if (role !== "manager") {
    return (
      <div>
        <PageHeader title="审批" description="经理专属的审批队列" />
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="rounded-full bg-slate-100 p-3 text-slate-400"><Lock size={20} /></span>
            <div className="text-sm font-medium text-slate-800" data-testid="approvals-forbidden">当前为销售角色，无法访问审批队列</div>
            <p className="max-w-md text-xs text-slate-500">审批需要经理权限。请切换到「经理老王」后再处理，或回到工作台继续自己的工作。</p>
            <Button size="sm" variant="secondary" onClick={() => navigate("/dashboard")}>返回工作台</Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  const approvals = data?.approvals ?? [];
  const pending = approvals.filter((row) => row.status === "pending");
  const visible = tab === "pending" ? pending : approvals;

  async function decide(decision: "approve" | "reject") {
    if (!selected) return;
    setDeciding(decision);
    setDecideError(null);
    try {
      const result = await apiPost<ApprovalDecisionResponse>(`/api/approvals/${selected.id}/decide`, {
        decision,
        comment: comment.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      if (decision === "reject") pushToast("审批已驳回", "info");
      else if (result.data.order) pushToast(`已批准，订单 ${result.data.order.orderNo} 已创建`, "success");
      else pushToast("审批已通过", "success");
      bumpData();
      setSelected(null);
      setComment("");
      refetch();
    } catch (caught) {
      setDecideError(errorMessage(caught));
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="审批"
        description="团队报价底线与超信用转订单申请"
        actions={
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "pending", label: "待审批", count: pending.length },
              { value: "all", label: "全部", count: approvals.length },
            ]}
          />
        }
      />

      {loading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        visible.length === 0 ? (
          <EmptyState
            title={tab === "pending" ? "暂无待审批" : "暂无审批记录"}
            description={tab === "pending" ? "团队暂时没有需要处理的申请。" : "转订单或低于价格底线的报价会生成审批记录。"}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>类型</TH>
                <TH>客户</TH>
                <TH>申请人</TH>
                <TH className="text-right">金额</TH>
                <TH>原因</TH>
                <TH>状态</TH>
                <TH>提交时间</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((approval) => (
                <TR key={approval.id} className="cursor-pointer hover:bg-slate-50" onClick={() => { setSelected(approval); setComment(""); setDecideError(null); }}>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <CheckSquare size={13} className="text-slate-400" />
                      <span className="font-medium text-slate-800">{TYPE_LABEL[approval.type] ?? approval.type}</span>
                    </div>
                  </TD>
                  <TD>{approval.customerName ?? "—"}</TD>
                  <TD>{approval.requesterName ?? approval.requesterId}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(approval.amountCents)}</TD>
                  <TD className="max-w-[220px] truncate">{approval.reason}</TD>
                  <TD><Badge tone={statusTone(approval.status)}>{statusLabel(approval.status)}</Badge></TD>
                  <TD>{formatDateTime(approval.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="审批详情"
        description={selected ? `${TYPE_LABEL[selected.type] ?? selected.type} · ${selected.customerName ?? "—"}` : undefined}
        footer={
          selected?.status === "pending" ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => decide("reject")} disabled={deciding !== null}>
                {deciding === "reject" ? "处理中…" : "驳回"}
              </Button>
              <Button size="sm" onClick={() => decide("approve")} disabled={deciding !== null}>
                {deciding === "approve" ? "处理中…" : "批准"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>关闭</Button>
          )
        }
      >
        {selected ? (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Info label="申请人" value={selected.requesterName ?? selected.requesterId} />
              <Info label="金额" value={formatMoney(selected.amountCents)} />
              <Info label="状态" value={statusLabel(selected.status)} />
              <Info label="提交时间" value={formatDateTime(selected.createdAt)} />
              {selected.approverName ? <Info label="审批人" value={selected.approverName} /> : null}
              {selected.decidedAt ? <Info label="处理时间" value={formatDateTime(selected.decidedAt)} /> : null}
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-[11px] text-slate-400">申请原因</div>
              <div className="mt-0.5 text-slate-700">{selected.reason}</div>
            </div>
            {selected.comment ? (
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-[11px] text-slate-400">审批意见</div>
                <div className="mt-0.5 text-slate-700">{selected.comment}</div>
              </div>
            ) : null}
            {selected.status === "pending" ? (
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-600">审批意见</div>
                <Textarea aria-label="审批意见" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="可选，驳回时建议说明原因" />
              </div>
            ) : null}
            {decideError ? <div className="rounded-lg bg-rose-50 p-2 text-rose-700">{decideError}</div> : null}
          </div>
        ) : null}
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
