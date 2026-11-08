import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import {
  apiPost,
  errorMessage,
  useApi,
  type CustomerDetailResponse,
  type CustomersResponse,
  type InventoryResponse,
  type QuoteCommitResponse,
  type QuoteDetailResponse,
  type QuotePreviewResponse,
} from "../api/business";
import { useAppStore } from "../state/store";
import { formatMoney } from "../lib/utils";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { ErrorBanner, LoadingBlock } from "../components/ui/Feedback";

interface LineDraft {
  key: number;
  sku: string;
  quantity: string;
}

let lineKey = 0;
const newLine = (): LineDraft => ({ key: ++lineKey, sku: "", quantity: "1" });

export function QuoteNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { bumpData, pushToast } = useAppStore();

  const initialCustomerId = searchParams.get("customerId") ?? "";
  const initialContactId = searchParams.get("contactId") ?? "";
  const fromQuoteId = searchParams.get("fromQuoteId") ?? undefined;
  const [opportunityId, setOpportunityId] = useState<string | undefined>(searchParams.get("opportunityId") ?? undefined);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [contactId, setContactId] = useState(initialContactId);
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [notes, setNotes] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [preview, setPreview] = useState<QuotePreviewResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const { data: customerData, loading: customersLoading, error: customersError } = useApi<CustomersResponse>("/api/business/customers");
  const { data: detail, loading: detailLoading } = useApi<CustomerDetailResponse>(
    customerId ? `/api/business/customers/${customerId}` : null,
  );
  const { data: inventoryData } = useApi<InventoryResponse>("/api/business/inventory");
  const { data: sourceQuote } = useApi<QuoteDetailResponse>(
    fromQuoteId ? `/api/business/quotes/${fromQuoteId}` : null,
  );

  const products = useMemo(() => {
    const map = new Map<string, { sku: string; name: string; available: number }>();
    (inventoryData?.inventory ?? []).forEach((row) => {
      const existing = map.get(row.sku);
      map.set(row.sku, {
        sku: row.sku,
        name: row.productName,
        available: (existing?.available ?? 0) + row.available,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
  }, [inventoryData]);

  // Keep a valid contact selected whenever the customer changes.
  useEffect(() => {
    if (!detail) {
      setContactId("");
      return;
    }
    const valid = detail.contacts.some((contact) => contact.id === contactId);
    if (!valid) {
      const primary = detail.contacts.find((contact) => contact.isPrimary) ?? detail.contacts[0];
      setContactId(primary?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  // A revision starts from the source quote, but edits create a brand-new quote.
  useEffect(() => {
    if (!fromQuoteId || !sourceQuote || prefilled) return;
    setCustomerId(sourceQuote.quote.customerId);
    setContactId(sourceQuote.quote.contactId);
    setOpportunityId(sourceQuote.quote.opportunityId ?? undefined);
    setNotes(sourceQuote.quote.notes ?? "");
    setLines(sourceQuote.lines.map((line) => ({ key: ++lineKey, sku: line.sku ?? "", quantity: String(line.quantity) })));
    setPrefilled(true);
  }, [fromQuoteId, sourceQuote, prefilled]);

  function markDirty() {
    setPreview(null);
    setPreviewError(null);
  }

  function updateLine(key: number, patch: Partial<LineDraft>) {
    markDirty();
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function validate(): string | null {
    if (!customerId) return "请选择客户";
    if (!contactId) return "请选择联系人";
    if (lines.length === 0) return "至少需要一条明细";
    for (const line of lines) {
      if (!line.sku) return "每条明细都需要选择产品";
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) return "数量必须是正整数";
    }
    return null;
  }

  async function runPreview() {
    const validation = validate();
    if (validation) {
      setFormError(validation);
      return;
    }
    setFormError(null);
    setPreviewError(null);
    setPreviewing(true);
    try {
      const result = await apiPost<QuotePreviewResponse>("/api/business/quotes/preview", {
        customerId,
        contactId,
        opportunityId,
        lines: lines.map((line) => ({ sku: line.sku, quantity: Number(line.quantity) })),
        notes: notes.trim() || undefined,
      });
      setPreview(result);
    } catch (caught) {
      setPreviewError(errorMessage(caught));
    } finally {
      setPreviewing(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setCommitting(true);
    setPreviewError(null);
    try {
      const result = await apiPost<QuoteCommitResponse>("/api/business/quotes/commit", {
        token: preview.confirmationToken,
        payload: preview.input,
        idempotencyKey: crypto.randomUUID(),
      });
      const quoteId = result.data.quote.id;
      bumpData();
      pushToast("报价已生成", "success");
      navigate(`/quotes/${quoteId}`);
    } catch (caught) {
      setPreviewError(errorMessage(caught));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={fromQuoteId ? "修订报价" : "新建报价"}
        description={
          fromQuoteId
            ? "已预填原报价的客户、联系人和明细；修改后生成一张新报价，原报价保留为历史。"
            : "客户与价格由服务端校验，预览确认后才会生成正式报价单。"
        }
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(fromQuoteId ? `/quotes/${fromQuoteId}` : "/quotes")}
          >
            {fromQuoteId ? "返回原报价" : "返回报价列表"}
          </Button>
        }
      />

      {customersError ? <ErrorBanner message={customersError} /> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <Card>
            <CardHeader title="基本信息" description="选择客户后会自动加载该客户联系人" />
            <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="客户" htmlFor="quote-customer">
                <Select
                  id="quote-customer"
                  value={customerId}
                  disabled={customersLoading}
                  onChange={(event) => {
                    markDirty();
                    setCustomerId(event.target.value);
                    setContactId("");
                  }}
                >
                  <option value="">{customersLoading ? "加载客户中…" : "请选择客户"}</option>
                  {(customerData?.customers ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}（{customer.level} 级 · {customer.region}）
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="联系人" htmlFor="quote-contact" hint={detailLoading && customerId ? "加载联系人…" : undefined}>
                <Select
                  id="quote-contact"
                  value={contactId}
                  disabled={!customerId || detailLoading}
                  onChange={(event) => {
                    markDirty();
                    setContactId(event.target.value);
                  }}
                >
                  <option value="">{customerId ? "请选择联系人" : "请先选择客户"}</option>
                  {(detail?.contacts ?? []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name} · {contact.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label="备注" htmlFor="quote-notes">
                  <Textarea id="quote-notes" rows={2} value={notes} onChange={(event) => { markDirty(); setNotes(event.target.value); }} placeholder="可选，最多 500 字" maxLength={500} />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="报价明细"
              description="价格由服务端按客户等级与数量计算"
              actions={<Button size="sm" variant="secondary" onClick={() => { markDirty(); setLines((current) => [...current, newLine()]); }}><Plus size={13} /> 添加明细</Button>}
            />
            <CardBody className="space-y-2">
              {lines.map((line) => (
                <div key={line.key} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="产品" htmlFor={`line-sku-${line.key}`}>
                      <Select id={`line-sku-${line.key}`} aria-label="产品" value={line.sku} onChange={(event) => updateLine(line.key, { sku: event.target.value })}>
                        <option value="">请选择产品</option>
                        {products.map((product) => (
                          <option key={product.sku} value={product.sku}>{product.sku} · {product.name}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="w-28">
                    <Field label="数量" htmlFor={`line-qty-${line.key}`}>
                      <Input id={`line-qty-${line.key}`} aria-label="数量" type="number" min={1} value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} />
                    </Field>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="删除明细"
                    disabled={lines.length === 1}
                    onClick={() => { markDirty(); setLines((current) => current.filter((item) => item.key !== line.key)); }}
                    className="mb-0.5"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="报价预览"
              description={preview ? `确认令牌有效期至 ${new Date(preview.preview.validUntil).toLocaleString("zh-CN")}` : "填写明细后点击预览"}
              actions={<Button size="sm" onClick={runPreview} disabled={previewing}>{previewing ? "预览中…" : "预览"}</Button>}
            />
            <CardBody className="space-y-3">
              {formError ? <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">{formError}</div> : null}
              {previewError ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{previewError}</div> : null}

              {!preview ? (
                <div className="py-8 text-center text-xs text-slate-400">暂无预览</div>
              ) : (
                <>
                  <div className="text-xs text-slate-500">客户：<span className="font-medium text-slate-800">{preview.preview.customer.name}</span></div>
                  <div className="space-y-1">
                    {preview.preview.lines.map((line) => (
                      <div key={line.sku} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium text-slate-800">{line.sku}</span>
                          <span className="ml-1 text-slate-400">× {line.quantity}</span>
                          {line.belowFloor ? <Badge tone="warning" className="ml-2">低于底线</Badge> : null}
                        </div>
                        <span className="tabular-nums text-slate-700">{formatMoney(line.lineTotalCents)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1 border-t border-slate-100 pt-2 text-xs">
                    <Row label="小计" value={formatMoney(preview.preview.totals.subtotalCents)} />
                    <Row label="税额" value={formatMoney(preview.preview.totals.taxTotalCents)} />
                    <Row label="合计" value={formatMoney(preview.preview.totals.totalCents)} strong />
                  </div>

                  <div className="space-y-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span>客户信用可用</span>
                      <span className="tabular-nums">{formatMoney(preview.preview.customer.creditAvailableCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>本次金额</span>
                      <span className="tabular-nums">{formatMoney(preview.preview.totals.totalCents)}</span>
                    </div>
                    <div className={preview.preview.customer.creditAvailableCents < preview.preview.totals.totalCents ? "text-amber-700" : "text-emerald-700"}>
                      {preview.preview.customer.creditAvailableCents < preview.preview.totals.totalCents
                        ? "信用不足，转订单时需要经理审批"
                        : "信用充足"}
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                    <div className="mb-1 font-medium text-slate-700">库存提示</div>
                    {Array.from(new Set(preview.preview.lines.map((line) => line.sku))).map((sku) => {
                      const product = products.find((item) => item.sku === sku);
                      return (
                        <div key={sku} className="flex justify-between">
                          <span>{sku}</span>
                          <span className={product && product.available > 0 ? "text-emerald-700" : "text-rose-600"}>
                            可用 {product?.available ?? 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {preview.preview.riskFlags.length > 0 ? (
                    <div className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-700">
                      {preview.preview.riskFlags.map((flag) => <div key={flag.code}>{flag.message}</div>)}
                    </div>
                  ) : null}

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={commit} disabled={committing}>{committing ? "生成中…" : "确认生成"}</Button>
                    <Button size="sm" variant="secondary" onClick={() => navigate("/quotes")}>取消</Button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-sm font-semibold text-slate-900" : "text-slate-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
