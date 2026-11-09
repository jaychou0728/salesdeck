import { useEffect, useState } from "react";
import type { Role } from "@salesdeck/shared";
import { apiPost, errorMessage, useApi, type TeamMembersResponse } from "../api/business";
import { useAppStore } from "../state/store";
import { Button } from "./ui/Button";
import { Field, Input, Select } from "./ui/Field";
import { Modal } from "./ui/Modal";

export function NewCustomerModal({
  open,
  onClose,
  role,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
  onCreated?: (customerId: string) => void;
}) {
  const { pushToast, bumpData } = useAppStore();
  const isManager = role === "manager";
  const { data: team } = useApi<TeamMembersResponse>(open && isManager ? "/api/business/team-members" : null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [region, setRegion] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("月结 30 天");
  const [level, setLevel] = useState("C");
  const [ownerId, setOwnerId] = useState("");
  const [creditYuan, setCreditYuan] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setIndustry("");
    setRegion("");
    setPaymentTerms("月结 30 天");
    setLevel("C");
    setOwnerId("");
    setCreditYuan("0");
    setError(null);
  }, [open]);

  async function save() {
    if (!name.trim() || !industry.trim() || !region.trim() || !paymentTerms.trim()) {
      setError("请填写客户名称、行业、区域与账期");
      return;
    }
    const creditLimitCents = Math.round(Number(creditYuan) * 100);
    if (!Number.isFinite(creditLimitCents) || creditLimitCents < 0) {
      setError("请填写有效的初始额度");
      return;
    }
    if (isManager && !ownerId) {
      setError("请选择客户负责人");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await apiPost<{ ok: true; customer: { id: string } }>("/api/business/customers", {
        name: name.trim(),
        industry: industry.trim(),
        region: region.trim(),
        paymentTerms: paymentTerms.trim(),
        ...(isManager ? { level, ownerId, creditLimitCents } : {}),
      });
      pushToast("客户已创建", "success");
      bumpData();
      onCreated?.(result.customer.id);
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
      title="新建客户"
      description={isManager ? "经理可分配负责人、等级与初始信用额度" : "销售创建的客户默认归属本人；等级与信用额度由经理维护"}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "创建中…" : "创建客户"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="客户名称" htmlFor="new-customer-name">
          <Input id="new-customer-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="行业" htmlFor="new-customer-industry">
            <Input id="new-customer-industry" value={industry} onChange={(event) => setIndustry(event.target.value)} />
          </Field>
          <Field label="区域" htmlFor="new-customer-region">
            <Input id="new-customer-region" value={region} onChange={(event) => setRegion(event.target.value)} />
          </Field>
          <Field label="账期" htmlFor="new-customer-payment-terms">
            <Input id="new-customer-payment-terms" value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} />
          </Field>
          {isManager ? (
            <Field label="客户等级" htmlFor="new-customer-level">
              <Select id="new-customer-level" value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="A">A 级</option>
                <option value="B">B 级</option>
                <option value="C">C 级</option>
              </Select>
            </Field>
          ) : null}
          {isManager ? (
            <Field label="负责人" htmlFor="new-customer-owner">
              <Select id="new-customer-owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                <option value="">{salesMembers.length === 0 ? "加载销售中…" : "请选择销售"}</option>
                {salesMembers.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          {isManager ? (
            <Field label="初始信用额度（元）" htmlFor="new-customer-credit" hint="可设为 0，后续再走额度审批">
              <Input id="new-customer-credit" type="number" min={0} step={10000} value={creditYuan} onChange={(event) => setCreditYuan(event.target.value)} />
            </Field>
          ) : null}
        </div>
        {error ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
