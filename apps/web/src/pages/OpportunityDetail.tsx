import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, ClipboardList, FileText, Phone } from "lucide-react";
import type { PriorityItem } from "@salespilot/shared";
import { errorMessage, useApi, type OpportunityDetailResponse } from "../api/business";
import { updateOpportunity } from "../api/workspace";
import { useAppStore } from "../state/store";
import { formatMoney } from "../lib/utils";
import { formatDateTime, statusLabel, statusTone } from "../lib/status";
import { RISK_LABELS, STAGE_LABELS, priorityLabel, priorityTone, riskTone, stageTone } from "../lib/opportunity";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { AIAssessmentCard } from "../components/AIAssessmentCard";
import { FollowUpModal } from "../components/FollowUpModal";

export function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openAi, queuePrompt, pushToast } = useAppStore();
  const { data, loading, error, refetch } = useApi<OpportunityDetailResponse>(id ? `/api/business/opportunities/${id}` : null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draftAction, setDraftAction] = useState("");
  const [draftDue, setDraftDue] = useState("");

  if (loading && !data) return <LoadingBlock label="加载商机…" />;
  if (error) return <ErrorBanner message={error} onRetry={refetch} />;
  if (!data) return null;

  const { opportunity, customer, quotes, orders, followUps, priority, assessment } = data;

  function askAi(item: PriorityItem) {
    openAi(`正在推进 ${item.customerName} · ${item.name}`);
    queuePrompt(`帮我推进${item.customerName}`);
  }

  async function acceptSuggestion() {
    try {
      await updateOpportunity(opportunity.id, {
        nextAction: priority.suggestedAction,
        nextActionDueAt: Date.now() + 4 * 3600_000,
      });
      pushToast("已接受 AI 建议", "success");
      refetch();
    } catch (caught) {
      pushToast(errorMessage(caught), "error");
    }
  }

  async function saveNextAction() {
    if (!draftAction.trim()) return;
    try {
      await updateOpportunity(opportunity.id, {
        nextAction: draftAction.trim(),
        nextActionDueAt: draftDue ? new Date(`${draftDue}T17:00:00`).getTime() : null,
      });
      pushToast("下一步已更新", "success");
      setEditOpen(false);
      refetch();
    } catch (caught) {
      pushToast(errorMessage(caught), "error");
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate("/opportunities")} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft size={13} /> 返回商机列表
      </button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {customer.name} · {opportunity.name}
            <Badge tone={stageTone(opportunity.stage)}>{STAGE_LABELS[opportunity.stage] ?? opportunity.stage}</Badge>
            <Badge tone={riskTone(opportunity.riskLevel)}>{RISK_LABELS[opportunity.riskLevel]}</Badge>
            <Badge tone={priorityTone(priority.priority)}>{priorityLabel(priority.priority)}</Badge>
          </span>
        }
        description={`${formatMoney(opportunity.amountCents)} · 成交概率 ${opportunity.probability}% · 预计成交 ${new Date(opportunity.expectedCloseDate).toLocaleDateString("zh-CN")}`}
        actions={
          <>
            <Button size="sm" onClick={() => askAi(priority)}>
              <Bot size={14} /> 让 AI 帮我推进
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFollowUpOpen(true)}>
              <ClipboardList size={14} /> 记录跟进
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/quotes/new?customerId=${customer.id}&opportunityId=${opportunity.id}`)}>
              <FileText size={14} /> 新建报价
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="下一步行动" description="商机推进的核心" />
          <CardBody className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">下一步</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{opportunity.nextAction ?? "尚未设置"}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                截止：{opportunity.nextActionDueAt ? formatDateTime(opportunity.nextActionDueAt) : "—"}
              </div>
            </div>
            {!suggestionDismissed ? (
              <div className="rounded-lg bg-teal-50 p-3 text-xs text-teal-900">
                <div><span className="font-medium">AI 建议：</span>{priority.suggestedAction}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={acceptSuggestion}>接受建议</Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDraftAction(priority.suggestedAction);
                      setDraftDue("");
                      setEditOpen(true);
                    }}
                  >
                    修改
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSuggestionDismissed(true)}>
                    忽略
                  </Button>
                </div>
              </div>
            ) : null}
            <ul className="space-y-1 text-xs text-slate-600">
              {priority.reasons.map((reason) => (
                <li key={reason} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {reason}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setFollowUpOpen(true)}>
                <Phone size={13} /> 记录本次跟进
              </Button>
              <Button size="sm" variant="secondary" onClick={() => askAi(priority)}>
                <Bot size={13} /> 让 AI 给出推进方案
              </Button>
            </div>
          </CardBody>
        </Card>

        <AIAssessmentCard assessment={assessment} title="AI 商机判断" />
      </div>

      <Card>
        <CardHeader title="跟进时间线" description={`${followUps.length} 条记录`} />
        <CardBody className="space-y-2">
          {followUps.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">暂无跟进记录</div>
          ) : (
            followUps.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{item.type} · {item.content}</span>
                  <span className="text-[11px] text-slate-400">{formatDateTime(item.createdAt)}</span>
                </div>
                {item.result ? <div className="mt-1 text-slate-600">结果：{item.result}</div> : null}
                {item.nextAction ? (
                  <div className="mt-1 text-slate-500">
                    下一步：{item.nextAction}
                    {item.nextActionDueAt ? ` · ${formatDateTime(item.nextActionDueAt)}` : ""}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="关联报价" description={`${quotes.length} 张`} />
          <div className="p-3">
            {quotes.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">暂无关联报价</div>
            ) : (
              <Table>
                <THead><TR><TH>报价单</TH><TH>状态</TH><TH className="text-right">金额</TH></TR></THead>
                <TBody>
                  {quotes.map((quote) => (
                    <TR key={quote.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/quotes/${quote.id}`)}>
                      <TD className="font-medium text-slate-800">{quote.quoteNo}</TD>
                      <TD><Badge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</Badge></TD>
                      <TD className="text-right tabular-nums">{formatMoney(quote.totalCents)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="关联订单" description={`${orders.length} 笔`} />
          <div className="p-3">
            {orders.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">暂无关联订单</div>
            ) : (
              <Table>
                <THead><TR><TH>订单</TH><TH>状态</TH><TH className="text-right">金额</TH></TR></THead>
                <TBody>
                  {orders.map((order) => (
                    <TR key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${order.id}`)}>
                      <TD className="font-medium text-slate-800">{order.orderNo}</TD>
                      <TD><Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge></TD>
                      <TD className="text-right tabular-nums">{formatMoney(order.totalCents)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="修改下一步"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditOpen(false)}>取消</Button>
            <Button size="sm" onClick={saveNextAction}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="下一步" htmlFor="next-action">
            <Input id="next-action" value={draftAction} onChange={(event) => setDraftAction(event.target.value)} />
          </Field>
          <Field label="截止日期" htmlFor="next-action-due">
            <Input id="next-action-due" type="date" value={draftDue} onChange={(event) => setDraftDue(event.target.value)} />
          </Field>
        </div>
      </Modal>

      <FollowUpModal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        customerId={customer.id}
        opportunityId={opportunity.id}
        onSaved={refetch}
      />
    </div>
  );
}
