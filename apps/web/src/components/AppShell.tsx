import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bot,
  CheckSquare,
  FileText,
  History,
  LayoutDashboard,
  Menu,
  Package,
  RotateCcw,
  Shield,
  ShoppingCart,
  Target,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useAppStore, useRole } from "../state/store";
import { apiPost, errorMessage, useApi, type DashboardResponse, type MeResponse } from "../api/business";
import { AiDrawer } from "./AiDrawer";
import { AuditDrawer } from "./AuditDrawer";
import { ToastHost } from "./ui/Toast";
import { Spinner } from "./ui/Feedback";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

const BASE_NAV = [
  { to: "/dashboard", label: "工作台", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/customers", label: "客户", icon: Users, testId: "nav-customers" },
  { to: "/opportunities", label: "商机", icon: Target, testId: "nav-opportunities" },
  { to: "/inventory", label: "库存", icon: Package, testId: "nav-inventory" },
  { to: "/quotes", label: "报价", icon: FileText, testId: "nav-quotes" },
  { to: "/orders", label: "订单", icon: ShoppingCart, testId: "nav-orders" },
  { to: "/tickets", label: "售后", icon: Wrench, testId: "nav-tickets" },
];

const APPROVAL_NAV = { to: "/approvals", label: "审批", icon: CheckSquare, testId: "nav-approvals" };
const AUDIT_NAV = { to: "/audit", label: "审计", icon: History, testId: "nav-audit" };

export function AppShell() {
  const { actorId, setActor, setRole, resetChat, bumpData, openAi, pushToast } = useAppStore();
  const role = useRole();
  const navigate = useNavigate();
  const [resetting, setResetting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const { data: me } = useApi<MeResponse>("/api/business/me");
  useEffect(() => {
    if (me) setRole(me.actor.role);
  }, [me, setRole]);

  const { data: dashboard } = useApi<DashboardResponse>(role === "manager" ? "/api/business/dashboard" : null);
  const pendingCount = dashboard?.metrics.pendingApprovals ?? 0;
  const mobileNavItems: Array<{ to: string; label: string; icon: typeof LayoutDashboard; badge?: number }> = [
    ...BASE_NAV,
    ...(role === "manager" ? [{ ...APPROVAL_NAV, badge: pendingCount }] : []),
    AUDIT_NAV,
  ];

  function switchActor(next: string) {
    if (next === actorId) return;
    setActor(next);
    resetChat();
    navigate("/dashboard");
    pushToast(next === "u_manager_wang" ? "已切换为经理视图" : "已切换为销售视图", "info");
  }

  async function resetDemo() {
    setResetting(true);
    try {
      await apiPost("/api/demo/reset");
      resetChat();
      bumpData();
      navigate("/dashboard");
      pushToast("演示数据已重置", "success");
    } catch (caught) {
      pushToast(errorMessage(caught), "error");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2 md:gap-4">
          <button
            type="button"
            onClick={() => setMobileNavOpen((value) => !value)}
            aria-label={mobileNavOpen ? "关闭导航" : "打开导航"}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold text-white">SD</div>
            <div className="text-sm font-semibold tracking-tight text-slate-900">SalesDeck</div>
          </div>

          <nav className="hidden items-center gap-0.5 overflow-x-auto md:flex" aria-label="主导航">
            {BASE_NAV.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
            {role === "manager" ? <NavItem {...APPROVAL_NAV} badge={pendingCount} /> : null}
            <NavItem {...AUDIT_NAV} />
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="role-switch" className="sr-only">
            切换角色
          </label>
          <select
            id="role-switch"
            aria-label="切换角色"
            value={actorId}
            onChange={(event) => switchActor(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          >
            <option value="u_sales_lin">销售小林</option>
            <option value="u_manager_wang">经理老王</option>
          </select>
          <button
            type="button"
            onClick={() => openAi()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
          >
            <Bot size={14} />
            AI 助手
          </button>
          <button
            type="button"
            onClick={() => setResetConfirmOpen(true)}
            disabled={resetting}
            className="hidden items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:inline-flex"
          >
            {resetting ? <Spinner className="h-3.5 w-3.5" /> : <RotateCcw size={14} />}
            重置演示
          </button>
        </div>
      </header>

      {mobileNavOpen ? (
        <div className="border-b border-slate-200 bg-white px-3 py-2 md:hidden" data-testid="mobile-nav">
          <div className="grid grid-cols-3 gap-1">
            {mobileNavItems.map(({ to, label, icon: Icon, badge }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                    isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                  )
                }
              >
                <Icon size={14} />
                {label}
                {badge && badge > 0 ? (
                  <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {badge}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setMobileNavOpen(false);
              setResetConfirmOpen(true);
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw size={14} /> 重置演示数据
          </button>
        </div>
      ) : null}

      <div
        data-testid="permission-banner"
        className={cn(
          "flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-[11px]",
          role === "manager" ? "border-sky-100 bg-sky-50 text-sky-800" : "border-teal-100 bg-teal-50 text-teal-800",
        )}
      >
        <Shield size={13} />
        {role === "manager"
          ? "经理视图：团队客户与订单 / 可审批 / 可调整与调拨库存 / 可查看全员执行记录"
          : "销售视图：仅自己名下客户 / 可新建报价 / 可发起审批申请 / 库存只读"}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto w-full max-w-[1400px]">
          <Outlet />
        </div>
      </main>

      <AiDrawer />
      <AuditDrawer />
      <Modal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="重置演示数据？"
        description="会清空当前演示数据并重新灌入初始数据，AI 会话也会清空。"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setResetConfirmOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={resetting}
              onClick={() => {
                setResetConfirmOpen(false);
                void resetDemo();
              }}
            >
              {resetting ? "重置中…" : "重置数据"}
            </Button>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-slate-500">建议在正式演示前执行；重置后页面会回到作战室。</p>
      </Modal>
      <ToastHost />
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  testId,
  badge,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  testId?: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      data-testid={testId}
      className={({ isActive }) =>
        cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
          isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
        )
      }
    >
      <Icon size={14} />
      {label}
      {badge && badge > 0 ? (
        <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{badge}</span>
      ) : null}
    </NavLink>
  );
}
