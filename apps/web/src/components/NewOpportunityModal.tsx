import { useEffect, useState } from "react";
import { errorMessage, useApi, type CustomersResponse } from "../api/business";
import { createOpportunity } from "../api/workspace";
import { useAppStore } from "../state/store";
import { STAGE_LABELS } from "../lib/opportunity";
import { Button } from "./ui/Button";
import { Field, Input, Select, Textarea } from "./ui/Field";
import { Modal } from "./ui/Modal";

const STAGES = ["lead", "needs", "solution", "quote", "negotiation"];

function localDateString(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function NewOpportunityModal({
  open,
  onClose,
  initialCustomerId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialCustomerId?: string;
  onCreated?: (opportunityId: string) => void;
}) {
  const { pushToast, bumpData } = useAppStore();
  const { data: customersData, loading: customersLoading } = useApi<CustomersResponse>("/api/business/customers");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState("lead");
  const [probability, setProbability] = useState("10");
  const [expectedClose, setExpectedClose] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const inThirtyDays = new Date();
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);
    setCustomerId(initialCustomerId ?? "");
    setName("");
    setAmount("");
    setStage("lead");
    setProbability("10");
    setExpectedClose(localDateString(inThirtyDays));
    setNextAction("");
    setDueDate("");
    setError(null);
  }, [open, initialCustomerId]);

  async function save() {
    const parsedAmount = Number(amount);
    const parsedProbability = Number(probability);
    if (!customerId) {
      setError("请选择客户");
      return;
    }
    if (!name.trim()) {
      setError("请填写商机名称");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("请填写有效金额");
      return;
    }
    if (!Number.isInteger(parsedProbability) || parsedProbability < 0 || parsedProbability > 100) {
      setError("成交概率必须在 0–100 之间");
      return;
    }
    if (!expectedClose) {
      setError("请选择预计成交日期");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createOpportunity({
        customerId,
        name: name.trim(),
        amountCents: Math.round(parsedAmount * 100),
        stage,
        probability: parsedProbability,
        expectedCloseDate: new Date(`${expectedClose}T17:00:00`).getTime(),
        nextAction: nextAction.trim() || undefined,
        nextActionDueAt: dueDate ? new Date(`${dueDate}T17:00:00`).getTime() : undefined,
      });
      pushToast("商机已创建", "success");
      bumpData();
      onCreated?.(result.opportunity.id);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建商机"
      description="一个客户可以有多个商机；先记录金额、阶段和下一步"
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving || customersLoading}>
            {saving ? "创建中…" : "创建商机"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="客户" htmlFor="new-opp-customer">
          <Select
            id="new-opp-customer"
            value={customerId}
            disabled={customersLoading}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">{customersLoading ? "加载客户中…" : "请选择客户"}</option>
            {(customersData?.customers ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}（{customer.level} 级 · {customer.region}）
              </option>
            ))}
          </Select>
        </Field>
        <Field label="商机名称" htmlFor="new-opp-name">
          <Input
            id="new-opp-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：服务器采购"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="金额（元）" htmlFor="new-opp-amount" hint="按人民币元填写">
            <Input
              id="new-opp-amount"
              type="number"
              min={1}
              step={1000}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="例如 280000"
            />
          </Field>
          <Field label="成交概率（%）" htmlFor="new-opp-probability">
            <Input
              id="new-opp-probability"
              type="number"
              min={0}
              max={100}
              value={probability}
              onChange={(event) => setProbability(event.target.value)}
            />
          </Field>
          <Field label="阶段" htmlFor="new-opp-stage">
            <Select id="new-opp-stage" value={stage} onChange={(event) => setStage(event.target.value)}>
              {STAGES.map((value) => (
                <option key={value} value={value}>{STAGE_LABELS[value] ?? value}</option>
              ))}
            </Select>
          </Field>
          <Field label="预计成交日期" htmlFor="new-opp-close">
            <Input
              id="new-opp-close"
              type="date"
              value={expectedClose}
              onChange={(event) => setExpectedClose(event.target.value)}
            />
          </Field>
        </div>
        <Field label="下一步（可选）" htmlFor="new-opp-next">
          <Textarea
            id="new-opp-next"
            rows={2}
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
            placeholder="例如：联系采购确认预算与交付时间"
          />
        </Field>
        <Field label="下一步截止（可选）" htmlFor="new-opp-due">
          <Input id="new-opp-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
        {error ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
