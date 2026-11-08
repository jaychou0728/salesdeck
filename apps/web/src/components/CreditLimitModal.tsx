import { useEffect, useState } from "react";
import { apiPost, errorMessage, type CustomerRow } from "../api/business";
import { useAppStore } from "../state/store";
import { formatMoney } from "../lib/utils";
import { Button } from "./ui/Button";
import { Field, Input, Textarea } from "./ui/Field";
import { Modal } from "./ui/Modal";

function suggestedLimitYuan(customer: CustomerRow, quoteTotalCents: number) {
  const requiredCents = customer.creditUsedCents + quoteTotalCents;
  const roundedCents = Math.ceil(requiredCents / 100 / 10_000) * 10_000 * 100;
  return Math.max(roundedCents, customer.creditLimitCents + 1_000_000) / 100;
}

export function CreditLimitModal({
  open,
  onClose,
  customer,
  quoteTotalCents,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerRow;
  quoteTotalCents: number;
  onSubmitted?: () => void;
}) {
  const { pushToast, bumpData } = useAppStore();
  const [requestedYuan, setRequestedYuan] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRequestedYuan(String(suggestedLimitYuan(customer, quoteTotalCents)));
    setReason("客户信用额度不足，申请提升额度以完成本次订单。");
    setError(null);
  }, [open, customer, quoteTotalCents]);

  async function submit() {
    const requestedLimitCents = Math.round(Number(requestedYuan) * 100);
    if (!Number.isFinite(requestedLimitCents) || requestedLimitCents <= customer.creditLimitCents) {
      setError("申请额度必须高于当前信用额度");
      return;
    }
    if (reason.trim().length < 2) {
      setError("请填写提额原因");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/business/customers/${customer.id}/credit-limit-requests`, {
        requestedLimitCents,
        reason: reason.trim(),
      });
      pushToast("提额申请已提交经理审批", "success");
      bumpData();
      onSubmitted?.();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  const availableCents = customer.creditLimitCents - customer.creditUsedCents;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="申请提升信用额度"
      description={`客户：${customer.name}`}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? "提交中…" : "提交申请"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-400">当前额度</div>
            <div className="mt-0.5 font-medium tabular-nums">{formatMoney(customer.creditLimitCents)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-400">当前可用</div>
            <div className="mt-0.5 font-medium tabular-nums">{formatMoney(availableCents)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-400">已用额度</div>
            <div className="mt-0.5 font-medium tabular-nums">{formatMoney(customer.creditUsedCents)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-400">本次订单</div>
            <div className="mt-0.5 font-medium tabular-nums">{formatMoney(quoteTotalCents)}</div>
          </div>
        </div>

        <Field label="申请额度（元）" htmlFor="credit-limit-amount" hint="默认按“已用额度 + 本次订单”向上取整">
          <Input
            id="credit-limit-amount"
            aria-label="申请额度（元）"
            type="number"
            min={1}
            step={10000}
            value={requestedYuan}
            onChange={(event) => setRequestedYuan(event.target.value)}
          />
        </Field>
        <Field label="提额原因" htmlFor="credit-limit-reason">
          <Textarea
            id="credit-limit-reason"
            aria-label="提额原因"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="说明客户价值、回款安排和本次订单的信用需求"
          />
        </Field>
        {error ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
