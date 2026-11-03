import { useMemo, useState } from "react";
import { ArrowLeftRight, Lock, Search, SlidersHorizontal } from "lucide-react";
import {
  apiPost,
  errorMessage,
  useApi,
  type InventoryAdjustResult,
  type InventoryResponse,
  type InventoryRow,
  type InventoryTransferResult,
} from "../api/business";
import { useAppStore, useRole } from "../state/store";
import { formatMoney } from "../lib/utils";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

interface ProductOption {
  productId: string;
  sku: string;
  name: string;
}

export function Inventory() {
  const role = useRole();
  const isManager = role === "manager";
  const { bumpData, pushToast } = useAppStore();
  const [q, setQ] = useState("");
  const path = `/api/business/inventory${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
  const { data, loading, error, refetch } = useApi<InventoryResponse>(path);

  const rows = data?.inventory ?? [];
  const warehouses = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => map.set(row.warehouseId, row.warehouseName));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rows]);
  const products = useMemo(() => {
    const map = new Map<string, ProductOption>();
    rows.forEach((row) => map.set(row.productId, { productId: row.productId, sku: row.sku, name: row.productName }));
    return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
  }, [rows]);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ warehouseId: "", productId: "", delta: "", reason: "" });
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromWarehouseId: "", toWarehouseId: "", productId: "", quantity: "1" });
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  function openAdjust(row?: InventoryRow) {
    const target = row ?? rows[0];
    setAdjustForm({
      warehouseId: target?.warehouseId ?? warehouses[0]?.id ?? "",
      productId: target?.productId ?? products[0]?.productId ?? "",
      delta: "",
      reason: "",
    });
    setAdjustError(null);
    setAdjustOpen(true);
  }

  function openTransfer(row?: InventoryRow) {
    const target = row ?? rows[0];
    const other = warehouses.find((warehouse) => warehouse.id !== target?.warehouseId) ?? warehouses[1];
    setTransferForm({
      fromWarehouseId: target?.warehouseId ?? warehouses[0]?.id ?? "",
      toWarehouseId: other?.id ?? "",
      productId: target?.productId ?? products[0]?.productId ?? "",
      quantity: "1",
    });
    setTransferError(null);
    setTransferOpen(true);
  }

  async function submitAdjust() {
    const delta = Number(adjustForm.delta);
    if (!adjustForm.warehouseId || !adjustForm.productId) return setAdjustError("请选择仓库和产品");
    if (!Number.isInteger(delta) || delta === 0) return setAdjustError("调整数量必须是非零整数");
    if (adjustForm.reason.trim().length < 2) return setAdjustError("请填写至少 2 个字的调整原因");
    setAdjusting(true);
    setAdjustError(null);
    try {
      const result = await apiPost<InventoryAdjustResult>("/api/business/inventory/adjust", {
        warehouseId: adjustForm.warehouseId,
        productId: adjustForm.productId,
        delta,
        reason: adjustForm.reason.trim(),
      });
      pushToast(`库存已调整：${result.row.sku} @ ${result.row.warehouseName} 现存 ${result.row.onHand}，可用 ${result.row.available}`, "success");
      setAdjustOpen(false);
      bumpData();
      refetch();
    } catch (caught) {
      setAdjustError(errorMessage(caught));
    } finally {
      setAdjusting(false);
    }
  }

  async function submitTransfer() {
    const quantity = Number(transferForm.quantity);
    if (!transferForm.fromWarehouseId || !transferForm.toWarehouseId || !transferForm.productId) return setTransferError("请选择源仓、目标仓和产品");
    if (transferForm.fromWarehouseId === transferForm.toWarehouseId) return setTransferError("源仓与目标仓不能相同");
    if (!Number.isInteger(quantity) || quantity <= 0) return setTransferError("调拨数量必须是正整数");
    setTransferring(true);
    setTransferError(null);
    try {
      const result = await apiPost<InventoryTransferResult>("/api/business/inventory/transfer", {
        fromWarehouseId: transferForm.fromWarehouseId,
        toWarehouseId: transferForm.toWarehouseId,
        productId: transferForm.productId,
        quantity,
      });
      pushToast(`调拨完成：${result.from.sku} 从 ${result.from.warehouseName} 转至 ${result.to.warehouseName}，源仓可用 ${result.from.available}`, "success");
      setTransferOpen(false);
      bumpData();
      refetch();
    } catch (caught) {
      setTransferError(errorMessage(caught));
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="库存"
        description={isManager ? "按 SKU 与仓库查看可用库存，可执行调整与调拨" : "按 SKU 与仓库查看可用库存（只读）"}
        actions={
          <>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input aria-label="搜索库存" placeholder="搜索 SKU / 产品 / 仓库…" value={q} onChange={(event) => setQ(event.target.value)} className="w-56 pl-8" />
            </div>
            {isManager ? (
              <>
                <Button size="sm" onClick={() => openAdjust()}>
                  <SlidersHorizontal size={14} /> 调整
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openTransfer()}>
                  <ArrowLeftRight size={14} /> 调拨
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {!isManager ? (
        <div data-testid="inventory-readonly" className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
          <Lock size={14} className="text-slate-400" />
          销售角色为只读视图，调整与调拨需要经理权限。
        </div>
      ) : null}

      {loading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        data.inventory.length === 0 ? (
          <EmptyState title="没有匹配的库存记录" description="换一个关键词试试。" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>SKU / 产品</TH>
                <TH>仓库</TH>
                <TH className="text-right">在库</TH>
                <TH className="text-right">已预留</TH>
                <TH className="text-right">可用</TH>
                <TH className="text-right">安全库存</TH>
                <TH className="text-right">预计到货</TH>
                <TH>状态</TH>
              </TR>
            </THead>
            <TBody>
              {data.inventory.map((row) => (
                <TR key={`${row.warehouseId}-${row.productId}`} className={row.lowStock ? "bg-amber-50/40" : undefined}>
                  <TD>
                    <div className="font-medium text-slate-800">{row.sku}</div>
                    <div className="text-[11px] text-slate-400">{row.productName} · {formatMoney(row.listPriceCents)}</div>
                  </TD>
                  <TD>
                    <div>{row.warehouseName}</div>
                    <div className="text-[11px] text-slate-400">{row.region}</div>
                  </TD>
                  <TD className="text-right tabular-nums">{row.onHand}</TD>
                  <TD className="text-right tabular-nums">{row.reserved}</TD>
                  <TD className="text-right font-medium tabular-nums text-slate-800">{row.available}</TD>
                  <TD className="text-right tabular-nums">{row.safetyStock}</TD>
                  <TD className="text-right tabular-nums">{row.etaDays} 天</TD>
                  <TD>{row.lowStock ? <Badge tone="danger">低库存</Badge> : <Badge tone="success">正常</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="调整库存"
        description="调整会写入审计日志，并立即更新可用库存。"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAdjustOpen(false)}>取消</Button>
            <Button size="sm" onClick={submitAdjust} disabled={adjusting}>{adjusting ? "提交中…" : "确认调整"}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="仓库" htmlFor="adjust-warehouse">
            <Select id="adjust-warehouse" value={adjustForm.warehouseId} onChange={(event) => setAdjustForm({ ...adjustForm, warehouseId: event.target.value })}>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </Select>
          </Field>
          <Field label="产品" htmlFor="adjust-product">
            <Select id="adjust-product" value={adjustForm.productId} onChange={(event) => setAdjustForm({ ...adjustForm, productId: event.target.value })}>
              {products.map((product) => <option key={product.productId} value={product.productId}>{product.sku} · {product.name}</option>)}
            </Select>
          </Field>
          <Field label="调整数量" htmlFor="adjust-delta" hint="正数入库，负数出库；不能为 0。">
            <Input id="adjust-delta" type="number" value={adjustForm.delta} onChange={(event) => setAdjustForm({ ...adjustForm, delta: event.target.value })} placeholder="例如 10 或 -5" />
          </Field>
          <Field label="调整原因" htmlFor="adjust-reason">
            <Textarea id="adjust-reason" rows={2} value={adjustForm.reason} onChange={(event) => setAdjustForm({ ...adjustForm, reason: event.target.value })} placeholder="例如：补货入库 / 盘点修正" />
          </Field>
          {adjustError ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{adjustError}</div> : null}
        </div>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="仓库调拨"
        description="源仓可用库存不足时调拨会被拒绝。"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTransferOpen(false)}>取消</Button>
            <Button size="sm" onClick={submitTransfer} disabled={transferring}>{transferring ? "提交中…" : "确认调拨"}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="源仓" htmlFor="transfer-from">
              <Select id="transfer-from" value={transferForm.fromWarehouseId} onChange={(event) => setTransferForm({ ...transferForm, fromWarehouseId: event.target.value })}>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </Select>
            </Field>
            <Field label="目标仓" htmlFor="transfer-to">
              <Select id="transfer-to" value={transferForm.toWarehouseId} onChange={(event) => setTransferForm({ ...transferForm, toWarehouseId: event.target.value })}>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="产品" htmlFor="transfer-product">
            <Select id="transfer-product" value={transferForm.productId} onChange={(event) => setTransferForm({ ...transferForm, productId: event.target.value })}>
              {products.map((product) => <option key={product.productId} value={product.productId}>{product.sku} · {product.name}</option>)}
            </Select>
          </Field>
          <Field label="调拨数量" htmlFor="transfer-quantity">
            <Input id="transfer-quantity" type="number" min={1} value={transferForm.quantity} onChange={(event) => setTransferForm({ ...transferForm, quantity: event.target.value })} />
          </Field>
          {transferError ? <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{transferError}</div> : null}
        </div>
      </Modal>
    </div>
  );
}
