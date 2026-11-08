import { useEffect, useState } from "react";
import { apiPatch, errorMessage, type CustomerRow } from "../api/business";
import { useAppStore } from "../state/store";
import { formatMoney } from "../lib/utils";
import { Button } from "./ui/Button";
import { Field, Input, Textarea } from "./ui/Field";
import { Modal } from "./ui/Modal";

export function CreditLimitEditModal({
  open,
  onClose,
  customer,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerRow;
  onSaved?: () => void;
}) {
  const { pushToast, bumpData } = useAppStore();
  const [limitYuan, setLimitYuan] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLimitYuan(String(customer.creditLimitCents / 100));
    setReason("");
    setError(null);
  }, [open, customer]);

  async function save() {
    const limitCents = Math.round(Number(limitYuan) * 100);
    if (!Number.isFinite(limitCents) || limitCents < 0) {
      setError("请填写有效的额度");
      return;
    }
    if (limitCents < customer.creditUsedCents) {
      setError(`额度不能低于已用额度 ${formatMoney(customer.creditUsedCents)}`);
      return;
    }
    if (reason.trim().length < 2) {
      setError("请填写调整原因");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPatch(`/api/business/customers/${customer.id}/credit-limit`, {
        limitCents,
        reason: reason.trim(),
      });
      pushToast(`信用额度已更新为 ${formatMoney(limitCents)}`, "success");
      bumpData();
      onSaved?.();
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
      title="调整信用额度"
      description={`客户：${customer.name} · 直接调整会作废仍在审批中的提额申请`}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存额度"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600">
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-400">当前额度</div>
            <div className="mt-0.5 font-medium tabular-nums">{formatMoney(customer.creditLimitCents)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-400">已用额度</div>
            <div className="mt-0.5 font-medium tabular-nums">{formatMoney(customer.creditUsedCents)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-400">当前可用</div>
            <div className="mt-0.5 font-medium tabular-nums">{formatMoney(availableCents)}</div>
          </div>
        </div>
        <Field label="新额度（元）" htmlFor="credit-limit-edit-amount" hint="不能低于客户已用额度">
          <Input
            id="credit-limit-edit-amount"
            aria-label="新额度（元）"
            type="number"
            min={0}
            step={10000}
            value={limitYuan}
            onChange={(event) => setLimitYuan(event.target.value)}
          />
        </Field>
        <Field label="调整原因" htmlFor="credit-limit-edit-reason">
          <Textarea
            id="credit-limit-edit-reason"
            aria-label="调整原因"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="例如：客户完成回款，按季度资信复核上调额度"
          />
        </Field>
        {error ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
