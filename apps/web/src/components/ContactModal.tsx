import { useEffect, useState } from "react";
import { apiDelete, apiPatch, apiPost, errorMessage, type ContactRow } from "../api/business";
import { useAppStore } from "../state/store";
import { Button } from "./ui/Button";
import { Field, Input } from "./ui/Field";
import { Modal } from "./ui/Modal";

export function ContactModal({
  open,
  onClose,
  customerId,
  contact,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  contact: ContactRow | null;
  onSaved?: () => void;
}) {
  const { pushToast, bumpData } = useAppStore();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(contact?.name ?? "");
    setTitle(contact?.title ?? "");
    setPhone(contact?.phone ?? "");
    setEmail(contact?.email ?? "");
    setIsPrimary(contact?.isPrimary ?? false);
    setConfirmDelete(false);
    setError(null);
  }, [open, contact]);

  async function save() {
    if (!name.trim() || !title.trim()) {
      setError("请填写联系人姓名与职位");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        title: title.trim(),
        phone: phone.trim(),
        email: email.trim(),
        isPrimary,
      };
      if (contact) await apiPatch(`/api/business/contacts/${contact.id}`, payload);
      else await apiPost(`/api/business/customers/${customerId}/contacts`, payload);
      pushToast(contact ? "联系人已更新" : "联系人已添加", "success");
      bumpData();
      onSaved?.();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!contact) return;
    setSaving(true);
    setError(null);
    try {
      await apiDelete(`/api/business/contacts/${contact.id}`);
      pushToast("联系人已删除", "success");
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
      title={contact ? "编辑联系人" : "添加联系人"}
      footer={
        <>
          {contact ? (
            confirmDelete ? (
              <Button size="sm" variant="danger" onClick={remove} disabled={saving}>确认删除</Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={saving}>删除</Button>
            )
          ) : null}
          <Button size="sm" variant="secondary" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="姓名" htmlFor="contact-name">
            <Input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="职位" htmlFor="contact-title">
            <Input id="contact-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：采购总监" />
          </Field>
          <Field label="电话" htmlFor="contact-phone">
            <Input id="contact-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="邮箱" htmlFor="contact-email">
            <Input id="contact-email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
          设为主要联系人
        </label>
        {confirmDelete ? <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">删除后无法恢复，请再次点击「确认删除」。</div> : null}
        {error ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
