import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bot,
  CheckSquare,
  FileText,
  History,
  LayoutDashboard,
  Package,
  RotateCcw,
  Shield,
  ShoppingCart,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useAppStore, useRole } from "../state/store";
import { apiPost, errorMessage, useApi, type DashboardResponse, type MeResponse } from "../api/business";
import { AiDrawer } from "./AiDrawer";
import { AuditDrawer } from "./AuditDrawer";
import { ToastHost } from "./ui/Toast";
import { Spinner } from "./ui/Feedback";

const BASE_NAV = [
  { to: "/dashboard", label: "工作台", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/customers", label: "客户", icon: Users, testId: "nav-customers" },
  { to: "/inventory", label: "库存", icon: Package, testId: "nav-inventory" },
  { to: "/quotes", label: "报价", icon: FileText, testId: "nav-quotes" },
  { to: "/orders", label: "订单", icon: ShoppingCart, testId: "nav-orders" },
  { to: "/tickets", label: "售后", icon: Wrench, testId: "nav-tickets" },
];

const AUDIT_NAV = { to: "/audit", label: "审计", icon: History, testId: "nav-audit" };

export function AppShell() {
  const { actorId, setActor, setRole, resetChat, bumpData, openAi, pushToast } = useAppStore();
  const role = useRole();
  const navigate = useNavigate();
  const [resetting, setResetting] = useState(false);

  const { data: me } = useApi<MeResponse>("/api/business/me");
  useEffect(() => {
    if (me) setRole(me.actor.role);
  }, [me, setRole]);

  const { data: dashboard } = useApi<DashboardResponse>(role === "manager" ? "/api/business/dashboard" : null);
  const pendingCount = dashboard?.metrics.pendingApprovals ?? 0;

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
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold text-white">SP</div>
            <div className="text-sm font-semibold tracking-tight text-slate-900">SalesPilot</div>
          </div>

          <nav className="flex items-center gap-0.5 overflow-x-auto" aria-label="主导航">
            {BASE_NAV.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
            {role === "manager" ? (
              <NavItem to="/approvals" label="审批" icon={CheckSquare} testId="nav-approvals" badge={pendingCount} />
            ) : null}
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
            onClick={resetDemo}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {resetting ? <Spinner className="h-3.5 w-3.5" /> : <RotateCcw size={14} />}
            重置演示
          </button>
        </div>
      </header>

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
