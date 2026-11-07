import { useEffect, useState } from "react";
import { apiPost, errorMessage } from "../api/business";
import { useAppStore } from "../state/store";
import { Button } from "./ui/Button";
import { Field, Input, Select, Textarea } from "./ui/Field";
import { Modal } from "./ui/Modal";

const TYPES = [
  { value: "call", label: "电话" },
  { value: "wechat", label: "微信" },
  { value: "email", label: "邮件" },
  { value: "meeting", label: "会议" },
  { value: "quote", label: "报价" },
  { value: "system", label: "系统动作" },
];

export function FollowUpModal({
  open,
  onClose,
  customerId,
  opportunityId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  opportunityId?: string;
  onSaved?: () => void;
}) {
  const { pushToast, bumpData } = useAppStore();
  const [type, setType] = useState("call");
  const [content, setContent] = useState("");
  const [result, setResult] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType("call");
    setContent("");
    setResult("");
    setNextAction("");
    setDueDate("");
    setError(null);
  }, [open]);

  async function save() {
    if (content.trim().length < 2) {
      setError("请填写跟进内容");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/business/follow-ups", {
        customerId,
        opportunityId,
        type,
        content: content.trim(),
        result: result.trim() || undefined,
        nextAction: nextAction.trim() || undefined,
        nextActionDueAt: dueDate ? new Date(`${dueDate}T17:00:00`).getTime() : undefined,
      });
      pushToast("跟进已记录", "success");
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
      title="记录跟进"
      description="保存后会更新商机的最近跟进时间与下一步"
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存跟进"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="跟进方式" htmlFor="follow-up-type">
          <Select id="follow-up-type" value={type} onChange={(event) => setType(event.target.value)}>
            {TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="跟进内容" htmlFor="follow-up-content">
          <Textarea
            id="follow-up-content"
            aria-label="跟进内容"
            rows={3}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="例如：电话联系采购，确认预算审批进度"
          />
        </Field>
        <Field label="跟进结果" htmlFor="follow-up-result">
          <Textarea
            id="follow-up-result"
            aria-label="跟进结果"
            rows={2}
            value={result}
            onChange={(event) => setResult(event.target.value)}
            placeholder="例如：客户表示本周五给答复"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="下一步" htmlFor="follow-up-next">
            <Input
              id="follow-up-next"
              aria-label="下一步"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="例如：周五再次联系采购"
            />
          </Field>
          <Field label="截止日期" htmlFor="follow-up-due">
            <Input
              id="follow-up-due"
              aria-label="截止日期"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
        </div>
        {error ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
