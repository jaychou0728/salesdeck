import { useEffect, useState } from "react";
import type { OpportunityDetailResponse } from "../api/business";
import { errorMessage } from "../api/business";
import { updateOpportunity } from "../api/workspace";
import { useAppStore } from "../state/store";
import { RISK_LABELS, STAGE_LABELS } from "../lib/opportunity";
import { Button } from "./ui/Button";
import { Field, Input, Select, Textarea } from "./ui/Field";
import { Modal } from "./ui/Modal";

function localDateString(timestamp: number | null | undefined) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function OpportunityEditModal({
  open,
  onClose,
  opportunity,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  opportunity: OpportunityDetailResponse["opportunity"];
  onSaved?: () => void;
}) {
  const { pushToast, bumpData } = useAppStore();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState(opportunity.stage);
  const [probability, setProbability] = useState("0");
  const [riskLevel, setRiskLevel] = useState(opportunity.riskLevel);
  const [expectedClose, setExpectedClose] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(opportunity.name);
    setAmount(String(opportunity.amountCents / 100));
    setStage(opportunity.stage);
    setProbability(String(opportunity.probability));
    setRiskLevel(opportunity.riskLevel);
    setExpectedClose(localDateString(opportunity.expectedCloseDate));
    setNextAction(opportunity.nextAction ?? "");
    setDueDate(localDateString(opportunity.nextActionDueAt));
    setError(null);
  }, [open, opportunity]);

  async function save() {
    const amountCents = Math.round(Number(amount) * 100);
    const parsedProbability = Number(probability);
    if (!name.trim()) return setError("请填写商机名称");
    if (!Number.isFinite(amountCents) || amountCents <= 0) return setError("请填写有效金额");
    if (!Number.isInteger(parsedProbability) || parsedProbability < 0 || parsedProbability > 100) {
      return setError("成交概率必须在 0–100 之间");
    }
    if (!expectedClose) return setError("请选择预计成交日期");
    setSaving(true);
    setError(null);
    try {
      await updateOpportunity(opportunity.id, {
        name: name.trim(),
        amountCents,
        stage,
        probability: parsedProbability,
        riskLevel,
        expectedCloseDate: new Date(`${expectedClose}T17:00:00`).getTime(),
        nextAction: nextAction.trim() || null,
        nextActionDueAt: dueDate ? new Date(`${dueDate}T17:00:00`).getTime() : null,
      });
      pushToast("商机已更新", "success");
      bumpData();
      onSaved?.();
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
      title="编辑商机"
      description="金额、阶段与概率会影响优先级排序与经理驾驶舱"
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="商机名称" htmlFor="edit-opp-name">
          <Input id="edit-opp-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="金额（元）" htmlFor="edit-opp-amount">
            <Input id="edit-opp-amount" type="number" min={1} step={1000} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="成交概率（%）" htmlFor="edit-opp-probability">
            <Input id="edit-opp-probability" type="number" min={0} max={100} value={probability} onChange={(event) => setProbability(event.target.value)} />
          </Field>
          <Field label="阶段" htmlFor="edit-opp-stage">
            <Select id="edit-opp-stage" value={stage} onChange={(event) => setStage(event.target.value as typeof stage)}>
              {Object.entries(STAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="风险等级" htmlFor="edit-opp-risk">
            <Select id="edit-opp-risk" value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as typeof riskLevel)}>
              {Object.entries(RISK_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="预计成交日期" htmlFor="edit-opp-close">
            <Input id="edit-opp-close" type="date" value={expectedClose} onChange={(event) => setExpectedClose(event.target.value)} />
          </Field>
          <Field label="下一步截止" htmlFor="edit-opp-due">
            <Input id="edit-opp-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>
        <Field label="下一步" htmlFor="edit-opp-next">
          <Textarea id="edit-opp-next" rows={2} value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
        </Field>
        {error ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
