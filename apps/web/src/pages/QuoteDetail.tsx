import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckSquare, ClipboardList, FileText, ShoppingCart } from "lucide-react";
import {
  apiGet,
  apiPost,
  errorMessage,
  useApi,
  type ConvertCommitResponse,
  type ConvertPreviewResponse,
  type OrdersResponse,
  type QuoteDetailResponse,
} from "../api/business";
import { useAppStore, useRole } from "../state/store";
import { formatMoney } from "../lib/utils";
import { formatDate, formatDateTime, parseRiskFlags, statusLabel, statusTone } from "../lib/status";
import { PageHeader } from "../components/ui/Page";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { FollowUpModal } from "../components/FollowUpModal";
import { CreditLimitModal } from "../components/CreditLimitModal";

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  order_conversion: "转订单审批",
  quote_price: "报价底线审批",
};

export function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { bumpData, pushToast } = useAppStore();
  const role = useRole();
  const { data, loading, error, refetch } = useApi<QuoteDetailResponse>(id ? `/api/business/quotes/${id}` : null);

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertSelections, setConvertSelections] = useState<Record<string, number>>({});
  const [convertPreview, setConvertPreview] = useState<ConvertPreviewResponse | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertCommitting, setConvertCommitting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [creditLimitOpen, setCreditLimitOpen] = useState(false);

  if (loading && !data) return <LoadingBlock label="加载报价详情…" />;
  if (error) return <ErrorBanner message={error} onRetry={refetch} />;
  if (!data) return null;

  const { quote, customer, contact, lines, approval } = data;

  function viewApproval() {
    if (role === "manager") navigate("/approvals");
    else document.getElementById("quote-approval")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const riskFlags = parseRiskFlags(quote.riskFlags);
  const canConvert = quote.status === "approved";
  const totalQuoted = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalConverted = lines.reduce((sum, line) => sum + line.convertedQuantity, 0);
  const partiallyConverted = quote.status !== "converted" && totalConverted > 0;
  const selectedPreviewLines = convertPreview
    ? convertPreview.preview.lines.filter((line) => line.convertingQuantity > 0)
    : [];
  const remainingAfter = convertPreview
    ? convertPreview.preview.lines.reduce((sum, line) => sum + Math.max(0, line.remainingAfter), 0)
    : 0;

  function closeConvert() {
    setConvertOpen(false);
    setConvertPreview(null);
    setConvertError(null);
  }

  function openConvert() {
    if (!id) return;
    setConvertPreview(null);
    setConvertError(null);
    setConvertSelections(
      Object.fromEntries(
        lines
          .filter((line) => line.quantity > line.convertedQuantity)
          .map((line) => [line.id, line.quantity - line.convertedQuantity]),
      ),
    );
    setConvertOpen(true);
  }

  async function previewConvert() {
    if (!id) return;
    const selected = lines
      .map((line) => ({ quoteLineId: line.id, quantity: convertSelections[line.id] ?? 0 }))
      .filter((line) => line.quantity > 0);
    if (selected.length === 0) {
      setConvertError("请至少选择一条明细并填写转单数量");
      return;
    }
    const overLimit = selected.find((row) => {
      const line = lines.find((item) => item.id === row.quoteLineId)!;
      return row.quantity > line.quantity - line.convertedQuantity;
    });
    if (overLimit) {
      setConvertError("转单数量不能超过剩余可转数量");
      return;
    }
    setConvertLoading(true);
    setConvertError(null);
    try {
      const result = await apiPost<ConvertPreviewResponse>(`/api/business/quotes/${id}/convert-preview`, {
        lines: selected,
      });
      setConvertPreview(result);
    } catch (caught) {
      setConvertError(errorMessage(caught));
    } finally {
      setConvertLoading(false);
    }
  }

  async function confirmConvert() {
    if (!id || !convertPreview) return;
    setConvertCommitting(true);
    setConvertError(null);
    try {
      const result = await apiPost<ConvertCommitResponse>(`/api/business/quotes/${id}/convert`, {
        token: convertPreview.confirmationToken,
        payload: convertPreview.input,
        idempotencyKey: crypto.randomUUID(),
      });
      bumpData();
      if (result.data.status === "pending_approval") {
        closeConvert();
        setNotice("已提交经理审批，审批通过后自动创建订单。");
        pushToast("信用不足，已提交经理审批", "info");
        refetch();
      } else if (result.data.order) {
        const order = result.data.order;
        if (order.fullyConverted === false) {
          closeConvert();
          pushToast(`订单 ${order.orderNo} 已创建，剩余数量可继续转单`, "success");
          refetch();
        } else {
          closeConvert();
          pushToast(`订单 ${order.orderNo} 已创建`, "success");
          navigate(`/orders/${order.id}`);
        }
      }
    } catch (caught) {
      setConvertError(errorMessage(caught));
    } finally {
      setConvertCommitting(false);
    }
  }

  async function viewOrder() {
    try {
      const orders = await apiGet<OrdersResponse>("/api/business/orders");
      const order = orders.orders.find((row) => row.quoteId === quote.id);
      if (order) navigate(`/orders/${order.id}`);
      else pushToast("未找到关联订单", "error");
    } catch (caught) {
      pushToast(errorMessage(caught), "error");
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate("/quotes")} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft size={13} /> 返回报价列表
      </button>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FileText size={18} className="text-slate-400" />
            <span data-testid="quote-no">{quote.quoteNo}</span>
            <Badge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</Badge>
            {partiallyConverted ? <Badge tone="info">部分转单</Badge> : null}
            {approval?.type === "order_conversion" && approval.status === "rejected" ? (
              <Badge tone="danger">转单被驳回</Badge>
            ) : null}
            {approval?.status === "pending" ? <Badge tone="warning">审批中</Badge> : null}
          </span>
        }
        description={
          customer ? (
            <span>
              客户 <Link className="text-teal-700 hover:underline" to={`/customers/${customer.id}`}>{customer.name}</Link>
              {contact ? ` · ${contact.name}（${contact.title}）` : ""} · 负责人 {quote.ownerName ?? quote.ownerId}
            </span>
          ) : undefined
        }
        actions={
          <>
            {quote.status === "converted" ? (
              <Button size="sm" variant="secondary" onClick={viewOrder}><ShoppingCart size={14} /> 查看订单</Button>
            ) : (
              <Button size="sm" onClick={openConvert} disabled={!canConvert || convertLoading}>
                <ShoppingCart size={14} /> {convertLoading ? "准备中…" : "转订单"}
              </Button>
            )}
            {quote.status !== "converted" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(`/quotes/new?customerId=${quote.customerId}&contactId=${quote.contactId}&fromQuoteId=${quote.id}`)}
              >
                <FileText size={14} /> {quote.status === "expired" ? "重新生成报价" : "修订报价"}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => setFollowUpOpen(true)}>
              <ClipboardList size={14} /> 记录跟进
            </Button>
            <Button size="sm" variant="secondary" onClick={viewApproval}>
              <CheckSquare size={14} /> 查看审批
            </Button>
          </>
        }
      />

      {quote.opportunityId ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
          所属商机
          <Link to={`/opportunities/${quote.opportunityId}`} className="font-medium text-teal-700 hover:underline">
            查看商机
          </Link>
        </div>
      ) : null}

      {approval?.type === "order_conversion" && approval.status === "rejected" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          <div>
            转订单申请已被经理驳回：{approval.comment || approval.reason}。报价本身仍有效，请先记录跟进并修订报价，或申请提额/调整付款方案后重新提交。
          </div>
          {customer ? (
            <div className="mt-2">
              <Button size="sm" variant="amber" onClick={() => setCreditLimitOpen(true)}>
                申请提额
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {quote.status === "expired" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <div className="font-medium">报价已过期，不能转订单。</div>
          <div className="mt-1 text-amber-700">
            报价是版本化单据，已发出的报价不能直接修改原单；修订会生成一张新报价，原报价保留作为历史。
          </div>
          <div className="mt-2">
            <Button
              size="sm"
              variant="amber"
              onClick={() => navigate(`/quotes/new?customerId=${quote.customerId}&contactId=${quote.contactId}&fromQuoteId=${quote.id}`)}
            >
              <FileText size={14} /> 重新生成报价
            </Button>
          </div>
        </div>
      ) : !canConvert && quote.status !== "converted" ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
          当前报价状态为「{statusLabel(quote.status)}」，只有已批准且未过期的报价才能转订单。
        </div>
      ) : null}

      {notice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span>{notice}</span>
          {role === "manager" ? (
            <Link to="/approvals" className="font-medium text-amber-900 underline">查看审批</Link>
          ) : (
            <a href="#quote-approval" className="font-medium text-amber-900 underline">查看审批</a>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="报价明细"
            description={`有效期至 ${formatDate(quote.validUntil)}${totalConverted > 0 ? ` · 已转 ${totalConverted}/${totalQuoted} 件` : ""}`}
          />
          <div className="p-3">
            <Table>
              <THead>
                <TR>
                  <TH>SKU / 产品</TH>
                  <TH className="text-right">数量</TH>
                  <TH className="text-right">已转 / 剩余</TH>
                  <TH className="text-right">单价</TH>
                  <TH className="text-right">小计</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((line) => {
                  const remaining = line.quantity - line.convertedQuantity;
                  return (
                    <TR key={line.id}>
                      <TD>
                        <div className="font-medium text-slate-800">{line.sku ?? line.productId}</div>
                        <div className="text-[11px] text-slate-400">{line.productName}</div>
                      </TD>
                      <TD className="text-right tabular-nums">{line.quantity}</TD>
                      <TD className="text-right tabular-nums">
                        <span className={line.convertedQuantity > 0 ? "text-teal-700" : "text-slate-400"}>{line.convertedQuantity}</span>
                        <span className="text-slate-300"> / </span>
                        <span className={remaining > 0 ? "text-slate-700" : "text-slate-400"}>{remaining}</span>
                      </TD>
                      <TD className="text-right tabular-nums">{formatMoney(line.unitPriceCents)}</TD>
                      <TD className="text-right tabular-nums">{formatMoney(line.lineTotalCents)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </Card>

        <Card>
          <CardHeader title="金额汇总" />
          <CardBody className="space-y-1.5 text-xs">
            <Row label="小计" value={formatMoney(quote.subtotalCents)} />
            <Row label="折扣" value={formatMoney(quote.discountTotalCents)} />
            <Row label="税额" value={formatMoney(quote.taxTotalCents)} />
            <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold text-slate-900">
              <span>合计</span>
              <span className="tabular-nums">{formatMoney(quote.totalCents)}</span>
            </div>
            <div className="mt-3 flex justify-between text-[11px] text-slate-500">
              <span>创建时间</span>
              <span>{formatDateTime(quote.createdAt)}</span>
            </div>
            {customer ? (
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>客户等级</span>
                <span>{customer.level} 级 · {customer.paymentTerms}</span>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {riskFlags.length > 0 ? (
        <Card>
          <CardHeader title="风险标记" description="由服务端定价与信用规则生成" />
          <CardBody className="space-y-1 text-xs">
            {riskFlags.map((flag) => (
              <div key={flag.code} className="flex items-center gap-2">
                <Badge tone={flag.severity === "blocker" ? "danger" : "warning"}>{flag.code}</Badge>
                <span className="text-slate-600">{flag.message}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card id="quote-approval">
        <CardHeader
          title="审批状态"
          description={approval ? "该报价关联一条审批记录" : "暂无关联审批"}
          actions={
            approval && role === "manager" ? (
              <Link to="/approvals" className="text-[11px] font-medium text-teal-700 hover:underline">查看审批队列</Link>
            ) : null
          }
        />
        <CardBody>
          {approval ? (
            <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-slate-400">类型</div>
                <div className="mt-0.5 font-medium text-slate-800">{APPROVAL_TYPE_LABELS[approval.type] ?? approval.type}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-slate-400">状态</div>
                <div className="mt-0.5"><Badge tone={statusTone(approval.status)}>{statusLabel(approval.status)}</Badge></div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 md:col-span-2">
                <div className="text-slate-400">原因</div>
                <div className="mt-0.5 text-slate-700">{approval.reason}</div>
              </div>
              {approval.comment ? (
                <div className="rounded-lg bg-slate-50 p-3 md:col-span-2">
                  <div className="text-slate-400">审批意见</div>
                  <div className="mt-0.5 text-slate-700">{approval.comment}</div>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title="暂无审批记录" description="当报价低于价格底线或转订单超出信用额度时会生成审批。" />
          )}
        </CardBody>
      </Card>

      <Modal
        open={convertOpen}
        onClose={closeConvert}
        title={convertPreview ? "转订单预览" : "选择转单明细"}
        description={
          convertPreview
            ? "确认后会占用对应库存与信用额度；信用不足时将转为经理审批。"
            : "按明细填写本次转单数量。未转数量保留在报价中，之后可继续转单。"
        }
        width="lg"
        footer={
          convertPreview ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setConvertPreview(null)}>返回修改</Button>
              <Button size="sm" onClick={confirmConvert} disabled={convertCommitting}>
                {convertCommitting ? "提交中…" : "确认提交"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={closeConvert}>取消</Button>
              <Button size="sm" onClick={previewConvert} disabled={convertLoading}>
                {convertLoading ? "准备中…" : "生成预览"}
              </Button>
            </>
          )
        }
      >
        {convertPreview ? (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Info label="报价单" value={convertPreview.preview.quoteNo} />
              <Info label="本次转单金额" value={formatMoney(convertPreview.preview.totalCents)} />
              <Info label="报价总额" value={formatMoney(convertPreview.preview.quoteTotalCents ?? quote.totalCents)} />
              <Info label="信用可用" value={formatMoney(convertPreview.preview.creditAvailableCents)} />
            </div>

            <div>
              <div className="mb-1 font-medium text-slate-700">本次转单明细</div>
              <Table>
                <THead>
                  <TR>
                    <TH>SKU / 产品</TH>
                    <TH className="text-right">本次转单</TH>
                    <TH className="text-right">转后剩余</TH>
                  </TR>
                </THead>
                <TBody>
                  {selectedPreviewLines.map((line) => (
                    <TR key={line.id}>
                      <TD>
                        <div className="font-medium text-slate-800">{line.sku ?? line.productId}</div>
                        <div className="text-[11px] text-slate-400">{line.productName}</div>
                      </TD>
                      <TD className="text-right tabular-nums">{line.convertingQuantity}</TD>
                      <TD className="text-right tabular-nums">{Math.max(0, line.remainingAfter)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="mt-2 text-[11px] text-slate-500">
                {remainingAfter > 0 ? `本次转单后仍剩余 ${remainingAfter} 件，可稍后继续转单。` : "本次转单后报价将全部转为订单。"}
              </div>
            </div>

            {convertPreview.preview.requiresApproval ? (
              <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
                {convertPreview.preview.reason ?? "信用额度不足"}，提交后将进入经理审批。
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">信用与库存检查通过，提交后立即创建订单。</div>
            )}

            <div>
              <div className="mb-1 font-medium text-slate-700">库存分配检查</div>
              <div className="space-y-1">
                {convertPreview.preview.stockChecks.map((check) => (
                  <div key={check.quoteLineId ?? check.productId} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                    <span>{check.productId}</span>
                    <span>
                      需求 {check.quantity} · {check.canFulfill ? <span className="text-emerald-700">可满足</span> : <span className="text-rose-600">缺 {check.missing}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {convertError ? <div className="rounded-lg bg-rose-50 p-2 text-rose-700">{convertError}</div> : null}
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <Table>
              <THead>
                <TR>
                  <TH>SKU / 产品</TH>
                  <TH className="text-right">报价数量</TH>
                  <TH className="text-right">已转</TH>
                  <TH className="text-right">剩余可转</TH>
                  <TH className="text-right">本次转单</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((line) => {
                  const remaining = line.quantity - line.convertedQuantity;
                  return (
                    <TR key={line.id}>
                      <TD>
                        <div className="font-medium text-slate-800">{line.sku ?? line.productId}</div>
                        <div className="text-[11px] text-slate-400">{line.productName}</div>
                      </TD>
                      <TD className="text-right tabular-nums">{line.quantity}</TD>
                      <TD className="text-right tabular-nums">{line.convertedQuantity}</TD>
                      <TD className="text-right tabular-nums">{remaining}</TD>
                      <TD className="text-right">
                        {remaining > 0 ? (
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            value={convertSelections[line.id] ?? 0}
                            aria-label={`${line.sku ?? line.productName} 本次转单数量`}
                            onChange={(event) => {
                              const next = Math.max(0, Math.min(remaining, Number(event.target.value) || 0));
                              setConvertSelections((prev) => ({ ...prev, [line.id]: next }));
                            }}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-xs focus:border-teal-500 focus:outline-none"
                          />
                        ) : (
                          <span className="text-slate-400">已全部转单</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {convertError ? <div className="rounded-lg bg-rose-50 p-2 text-rose-700">{convertError}</div> : null}
          </div>
        )}
      </Modal>

      <FollowUpModal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        customerId={quote.customerId}
        opportunityId={quote.opportunityId ?? undefined}
        onSaved={refetch}
      />

      {customer ? (
        <CreditLimitModal
          open={creditLimitOpen}
          onClose={() => setCreditLimitOpen(false)}
          customer={customer}
          quoteTotalCents={quote.totalCents}
          onSubmitted={refetch}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
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
