import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useApi, type CustomersResponse } from "../api/business";
import { formatMoney } from "../lib/utils";
import { formatPercent } from "../lib/status";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Field";
import { CreditBar } from "../components/ui/Field";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useRole } from "../state/store";

const LEVEL_TONE = { A: "teal", B: "info", C: "neutral" } as const;

export function Customers() {
  const navigate = useNavigate();
  const role = useRole();
  const [q, setQ] = useState("");
  const path = `/api/business/customers${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
  const { data, loading, error, refetch } = useApi<CustomersResponse>(path);

  return (
    <div>
      <PageHeader
        title="客户"
        description={role === "manager" ? "团队名下全部客户与信用使用情况" : "我负责的客户与信用使用情况"}
        actions={
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="搜索客户"
              placeholder="搜索名称或区域…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className="w-56 pl-8"
            />
          </div>
        }
      />

      {loading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        data.customers.length === 0 ? (
          <EmptyState title="没有匹配的客户" description="换一个关键词试试，或检查当前角色的数据范围。" />
        ) : (
          <div className="space-y-2">
            <div className="text-[11px] text-slate-500">共 {data.customers.length} 位客户</div>
            <Table>
              <THead>
                <TR>
                  <TH>客户名称</TH>
                  <TH>等级</TH>
                  <TH>负责人</TH>
                  <TH>区域</TH>
                  <TH className="min-w-[180px]">信用使用率</TH>
                  <TH className="text-right">已用 / 额度</TH>
                </TR>
              </THead>
              <TBody>
                {data.customers.map((customer) => (
                  <TR
                    key={customer.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/customers/${customer.id}`)}
                  >
                    <TD>
                      <div className="font-medium text-slate-800">{customer.name}</div>
                      <div className="text-[11px] text-slate-400">{customer.industry}</div>
                    </TD>
                    <TD>
                      <Badge tone={LEVEL_TONE[customer.level] ?? "neutral"}>{customer.level} 级</Badge>
                    </TD>
                    <TD>{customer.ownerName ?? customer.ownerId}</TD>
                    <TD>{customer.region}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <CreditBar utilization={customer.creditUtilization} className="w-24" />
                        <span className="text-[11px] tabular-nums text-slate-500">{formatPercent(customer.creditUtilization)}</span>
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatMoney(customer.creditUsedCents)} / {formatMoney(customer.creditLimitCents)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )
      ) : null}
    </div>
  );
}
