import { useEffect, useState } from "react";
import type { Role } from "@salesdeck/shared";
import { apiPatch, errorMessage, useApi, type CustomerRow, type TeamMembersResponse } from "../api/business";
import { useAppStore } from "../state/store";
import { Button } from "./ui/Button";
import { Field, Input, Select } from "./ui/Field";
import { Modal } from "./ui/Modal";

export function CustomerEditModal({
  open,
  onClose,
  customer,
  role,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerRow;
  role: Role;
  onSaved?: () => void;
}) {
  const { pushToast, bumpData } = useAppStore();
  const isManager = role === "manager";
  const { data: team } = useApi<TeamMembersResponse>(open && isManager ? "/api/business/team-members" : null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [region, setRegion] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [level, setLevel] = useState(customer.level);
  const [ownerId, setOwnerId] = useState(customer.ownerId);
  const [status, setStatus] = useState(customer.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(customer.name);
    setIndustry(customer.industry);
    setRegion(customer.region);
    setPaymentTerms(customer.paymentTerms);
    setLevel(customer.level);
    setOwnerId(customer.ownerId);
    setStatus(customer.status);
    setError(null);
  }, [open, customer]);

  async function save() {
    if (!name.trim() || !industry.trim() || !region.trim() || !paymentTerms.trim()) {
      setError("请填写客户名称、行业、区域与账期");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPatch(`/api/business/customers/${customer.id}`, {
        name: name.trim(),
        industry: industry.trim(),
        region: region.trim(),
        paymentTerms: paymentTerms.trim(),
        ...(isManager ? { level, ownerId, status } : {}),
      });
      pushToast("客户资料已更新", "success");
      bumpData();
      onSaved?.();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  const salesMembers = (team?.members ?? []).filter((member) => member.role === "sales");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑客户"
      description={isManager ? "经理可修改等级、负责人与状态" : "销售可维护本人客户的基础资料，等级与负责人由经理调整"}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="客户名称" htmlFor="customer-name">
          <Input id="customer-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="行业" htmlFor="customer-industry">
            <Input id="customer-industry" value={industry} onChange={(event) => setIndustry(event.target.value)} />
          </Field>
          <Field label="区域" htmlFor="customer-region">
            <Input id="customer-region" value={region} onChange={(event) => setRegion(event.target.value)} />
          </Field>
          <Field label="账期" htmlFor="customer-payment-terms">
            <Input id="customer-payment-terms" value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} placeholder="例如：月结 30 天" />
          </Field>
          {isManager ? (
            <Field label="客户等级" htmlFor="customer-level">
              <Select id="customer-level" value={level} onChange={(event) => setLevel(event.target.value as CustomerRow["level"])}>
                <option value="A">A 级</option>
                <option value="B">B 级</option>
                <option value="C">C 级</option>
              </Select>
            </Field>
          ) : null}
          {isManager ? (
            <Field label="负责人" htmlFor="customer-owner">
              <Select id="customer-owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                {salesMembers.length === 0 ? <option value={ownerId}>{customer.ownerName ?? ownerId}</option> : null}
                {salesMembers.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          {isManager ? (
            <Field label="合作状态" htmlFor="customer-status">
              <Select id="customer-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="active">合作中</option>
                <option value="inactive">已停用</option>
              </Select>
            </Field>
          ) : null}
        </div>
        {error ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
