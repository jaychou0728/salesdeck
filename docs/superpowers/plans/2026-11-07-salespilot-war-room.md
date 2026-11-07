# SalesPilot AI 销售作战室 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 SalesPilot 从“销售先提问的聊天式 CRM”升级为“AI 主动判断今天推进谁、为什么、怎么推进，并能执行”的销售作战室。

**Architecture:** 在现有 Fastify + LangGraph + Drizzle + React 上增量扩展。新增 `opportunities` / `follow_ups` 数据层与独立 `domain/workspace` 服务；前端与 AI 工具共用同一套优先级输出；保留现有 9 个工具、SSE、确认令牌、审批与权限。

**Tech Stack:** TypeScript · React 18 + Vite + Tailwind · Fastify 5 · LangGraph.js · Drizzle ORM + SQLite · Zod · Vitest · Playwright。

---

## 开始前

- 当前分支：`feature/salespilot`。所有提交都落在这个分支，不新建 worktree。
- 基线：`pnpm test` 应为 90 个测试全绿（shared 6 + server 84）。
- 金额单位统一为“分”；`yuan(x) = x * 100`。
- 每个 Task 完成后运行该 Task 指定的测试并提交；不要批量攒提交。
- 不要删除或重写现有 9 个工具、Agent 图、SSE、确认令牌与审批逻辑。

---

## 文件地图

### 新增

```text
apps/server/src/domain/priority.ts
apps/server/src/domain/workspace.ts
apps/server/src/domain/followUps.ts
apps/server/src/routes/workspace.ts
apps/server/src/routes/followUps.ts
apps/server/src/tools/read/getSalesPriorities.ts
apps/server/src/tools/read/getOpportunityDetail.ts
apps/server/src/tools/write/logFollowUp.ts
apps/server/src/tools/write/updateOpportunityNextAction.ts
apps/server/src/domain/priority.test.ts
apps/server/src/domain/workspace.test.ts
apps/server/src/domain/followUps.test.ts
apps/server/src/routes/workspace.test.ts
apps/server/src/routes/followUps.test.ts
apps/server/src/tools/proactive-tools.test.ts
apps/web/src/api/workspace.ts
apps/web/src/lib/opportunity.ts
apps/web/src/components/PriorityCard.tsx
apps/web/src/components/TodoPanel.tsx
apps/web/src/components/AIAssessmentCard.tsx
apps/web/src/components/FollowUpModal.tsx
apps/web/src/pages/Opportunities.tsx
apps/web/src/pages/OpportunityDetail.tsx
apps/web/tests/e2e/war-room.spec.ts
```

### 修改

```text
packages/shared/src/types.ts
packages/shared/src/schemas.ts
packages/shared/src/schemas.test.ts
apps/server/src/db/schema.ts
apps/server/src/db/schema.test.ts
apps/server/src/db/seed-data.ts
apps/server/src/db/seed.ts
apps/server/src/db/seed.test.ts
apps/server/src/routes/demo.ts
apps/server/src/routes/business.ts
apps/server/src/routes/approvals.ts                 # 仅在需要时复用，不改逻辑
apps/server/src/app.ts
apps/server/src/tools/index.ts
apps/server/src/tools/read/getCustomer360.ts
apps/server/src/tools/write/createQuote.ts
apps/server/src/domain/orders.ts
apps/server/src/agent/prompts.ts
apps/server/src/agent/mockProvider.ts
apps/server/src/eval/run.ts
evals/golden-cases.json
apps/web/src/api/business.ts
apps/web/src/App.tsx
apps/web/src/components/AppShell.tsx
apps/web/src/components/ChatStream.tsx
apps/web/src/components/ConfirmationCard.tsx
apps/web/src/components/ArtifactCard.tsx
apps/web/src/pages/Dashboard.tsx
apps/web/src/pages/CustomerDetail.tsx
README.md
docs/ARCHITECTURE.md
docs/DEMO_SCRIPT.md
docs/EVAL_REPORT.md
```

---

# Phase 1：数据与优先级基础

## Task 1：共享契约

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1：写失败测试**

把 `packages/shared/src/schemas.test.ts` 顶部的导入改为：

```ts
import { describe, expect, it } from "vitest";
import {
  ConfirmRequest,
  ConvertQuoteToOrderInput,
  CreateAfterSalesTicketInput,
  CreateQuoteInput,
  GetSalesPrioritiesInput,
  GetSalesBriefingInput,
  LogFollowUpInput,
  UpdateOpportunityNextActionInput,
  moneyCents,
} from "./schemas.js";
```

在文件末尾追加：

```ts
describe("proactive sales contracts", () => {
  it("parses priority scope and defaults", () => {
    const parsed = GetSalesPrioritiesInput.parse({ scope: "self" });
    expect(parsed.limit).toBe(5);
    expect(parsed.focus).toBe("all");
  });

  it("rejects a follow-up commit without token and idempotency key", () => {
    const result = LogFollowUpInput.safeParse({
      customerId: "c_huachen",
      type: "call",
      content: "确认预算",
      dryRun: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts the two new confirmation tool names", () => {
    for (const toolName of ["log_follow_up", "update_opportunity_next_action"]) {
      const result = ConfirmRequest.safeParse({
        token: "1234567890",
        toolName,
        payload: {},
        idempotencyKey: "idem-123456",
      });
      expect(result.success).toBe(true);
    }
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/shared exec vitest run src/schemas.test.ts`
Expected: FAIL，提示 `GetSalesPrioritiesInput` 未导出。

- [ ] **Step 3：实现类型**

在 `packages/shared/src/types.ts` 追加：

```ts
export type OpportunityStage = "lead" | "needs" | "solution" | "quote" | "negotiation" | "won" | "lost";
export type RiskLevel = "low" | "medium" | "high";
export type FollowUpType = "call" | "wechat" | "email" | "meeting" | "quote" | "system" | "ai_suggestion";
export type PriorityLevel = "P0" | "P1" | "P2";

export interface OpportunitySignals {
  creditUtilization: number | null;
  quoteExpiringAt: number | null;
  stockShortage: boolean;
  recentCustomerReply: boolean;
  idleDays: number;
  overdueDays: number;
}

export interface PriorityItem {
  opportunityId: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  amountCents: number;
  stage: OpportunityStage;
  probability: number;
  riskLevel: RiskLevel;
  priority: PriorityLevel;
  score: number;
  reasons: string[];
  suggestedAction: string;
  nextAction: string | null;
  nextActionDueAt: number | null;
  lastFollowUpAt: number | null;
  signals: OpportunitySignals;
}

export type TodoKind =
  | "today_follow_up"
  | "overdue_follow_up"
  | "approval"
  | "quote_to_advance"
  | "quote_expiring"
  | "ticket"
  | "order";

export interface TodoItem {
  id: string;
  kind: TodoKind;
  title: string;
  subtitle: string;
  customerId?: string;
  opportunityId?: string;
  amountCents?: number;
  dueAt?: number;
  severity: "info" | "warning" | "blocker";
  href: string;
}
```

把 `ArtifactKind` 扩展为：

```ts
export type ArtifactKind =
  | "customer"
  | "inventory"
  | "quote"
  | "approval"
  | "ticket"
  | "briefing"
  | "follow_up"
  | "next_action"
  | "error";
```

- [ ] **Step 4：实现 Zod schema**

在 `packages/shared/src/schemas.ts` 追加：

```ts
export const opportunityStage = z.enum(["lead", "needs", "solution", "quote", "negotiation", "won", "lost"]);
export const riskLevel = z.enum(["low", "medium", "high"]);
export const followUpType = z.enum(["call", "wechat", "email", "meeting", "quote", "system", "ai_suggestion"]);

export const GetSalesPrioritiesInput = z.object({
  scope: z.enum(["self", "team"]),
  limit: z.number().int().min(1).max(10).default(5),
  focus: z.enum(["all", "risk", "follow_up"]).default("all"),
});
export type GetSalesPrioritiesInput = z.infer<typeof GetSalesPrioritiesInput>;

export const GetOpportunityDetailInput = z.object({
  opportunityId: z.string().min(1),
});
export type GetOpportunityDetailInput = z.infer<typeof GetOpportunityDetailInput>;

export const LogFollowUpInput = z
  .object({
    customerId: z.string().min(1),
    opportunityId: z.string().min(1).optional(),
    type: followUpType,
    content: z.string().min(2).max(1000),
    result: z.string().max(500).optional(),
    nextAction: z.string().max(200).optional(),
    nextActionDueAt: z.number().int().nonnegative().optional(),
    dryRun: z.boolean(),
    confirmationToken: z.string().min(10).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .refine((value) => value.dryRun || (!!value.confirmationToken && !!value.idempotencyKey), {
    message: "commit requires confirmationToken and idempotencyKey",
  });
export type LogFollowUpInput = z.infer<typeof LogFollowUpInput>;

export const UpdateOpportunityNextActionInput = z
  .object({
    opportunityId: z.string().min(1),
    nextAction: z.string().min(2).max(200),
    nextActionDueAt: z.number().int().nonnegative().optional(),
    dryRun: z.boolean(),
    confirmationToken: z.string().min(10).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .refine((value) => value.dryRun || (!!value.confirmationToken && !!value.idempotencyKey), {
    message: "commit requires confirmationToken and idempotencyKey",
  });
export type UpdateOpportunityNextActionInput = z.infer<typeof UpdateOpportunityNextActionInput>;
```

把 `CreateQuoteInput` 的对象字段增加：

```ts
opportunityId: z.string().min(1).optional(),
```

把 `ConfirmRequest` 的 `toolName` 改为：

```ts
toolName: z.enum([
  "create_quote",
  "convert_quote_to_order",
  "create_after_sales_ticket",
  "log_follow_up",
  "update_opportunity_next_action",
]),
```

- [ ] **Step 5：运行测试确认通过**

Run: `pnpm --filter @salespilot/shared exec vitest run src/schemas.test.ts`
Expected: PASS。

- [ ] **Step 6：提交**

```bash
git add packages/shared/src/types.ts packages/shared/src/schemas.ts packages/shared/src/schemas.test.ts
git commit -m "feat: add proactive sales contracts"
```

---

## Task 2：数据库 Schema 与迁移

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Generate: `apps/server/drizzle/0001_*.sql`
- Test: `apps/server/src/db/schema.test.ts`

- [ ] **Step 1：写失败测试**

在 `apps/server/src/db/schema.test.ts` 的 `creates all core tables` 列表中追加：

```ts
"opportunities",
"follow_ups",
```

并追加一个测试：

```ts
it("adds opportunity linkage and monthly targets", () => {
  const { sqlite } = makeTestDb();
  expect(columnInfo(sqlite, "quotes", "opportunity_id")).toBeDefined();
  expect(columnInfo(sqlite, "orders", "opportunity_id")).toBeDefined();
  expect(columnInfo(sqlite, "users", "monthly_target_cents").dflt_value).toBe("0");
  expect(columnInfo(sqlite, "opportunities", "stage").notnull).toBe(1);
  expect(columnInfo(sqlite, "follow_ups", "type").notnull).toBe(1);
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/db/schema.test.ts`
Expected: FAIL，提示 `opportunities` 表不存在。

- [ ] **Step 3：实现 Schema**

在 `apps/server/src/db/schema.ts` 的 `users` 表加：

```ts
monthlyTargetCents: integer("monthly_target_cents").notNull().default(0),
```

在 `quotes` 表加：

```ts
opportunityId: text("opportunity_id"),
```

在 `orders` 表加：

```ts
opportunityId: text("opportunity_id"),
```

在文件末尾追加：

```ts
export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    stage: text("stage", {
      enum: ["lead", "needs", "solution", "quote", "negotiation", "won", "lost"],
    }).notNull(),
    probability: integer("probability").notNull().default(0),
    expectedCloseDate: integer("expected_close_date").notNull(),
    nextAction: text("next_action"),
    nextActionDueAt: integer("next_action_due_at"),
    riskLevel: text("risk_level", { enum: ["low", "medium", "high"] }).notNull().default("low"),
    lastFollowUpAt: integer("last_follow_up_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    customerIdx: index("opportunities_customer_idx").on(t.customerId),
    ownerStageIdx: index("opportunities_owner_stage_idx").on(t.ownerId, t.stage),
    dueIdx: index("opportunities_due_idx").on(t.nextActionDueAt),
  }),
);

export const followUps = sqliteTable(
  "follow_ups",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    opportunityId: text("opportunity_id"),
    actorId: text("actor_id").notNull(),
    type: text("type", {
      enum: ["call", "wechat", "email", "meeting", "quote", "system", "ai_suggestion"],
    }).notNull(),
    content: text("content").notNull(),
    result: text("result"),
    nextAction: text("next_action"),
    nextActionDueAt: integer("next_action_due_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    customerIdx: index("follow_ups_customer_idx").on(t.customerId, t.createdAt),
    opportunityIdx: index("follow_ups_opportunity_idx").on(t.opportunityId, t.createdAt),
  }),
);
```

- [ ] **Step 4：生成并应用迁移**

Run:

```bash
pnpm --filter @salespilot/server db:generate
pnpm --filter @salespilot/server db:migrate
```

Expected: `apps/server/drizzle/` 下出现 `0001_*.sql`；`migrations applied`。

打开生成的 SQL，确认只包含 `CREATE TABLE opportunities`、`CREATE TABLE follow_ups`、`ALTER TABLE quotes ADD opportunity_id`、`ALTER TABLE orders ADD opportunity_id`、`ALTER TABLE users ADD monthly_target_cents` 与索引；如果 Drizzle 生成了删除/重建表的语句，停止并改为手写迁移。

- [ ] **Step 5：运行测试确认通过**

Run: `pnpm --filter @salespilot/server exec vitest run src/db/schema.test.ts`
Expected: PASS。

- [ ] **Step 6：提交**

```bash
git add apps/server/src/db/schema.ts apps/server/src/db/schema.test.ts apps/server/drizzle
git commit -m "feat: add opportunities and follow-ups schema"
```

---

## Task 3：Demo 数据与重置

**Files:**
- Modify: `apps/server/src/db/seed-data.ts`
- Modify: `apps/server/src/db/seed.ts`
- Modify: `apps/server/src/routes/demo.ts`
- Test: `apps/server/src/db/seed.test.ts`

- [ ] **Step 1：写失败测试**

把 `apps/server/src/db/seed.test.ts` 的计数断言更新为：

```ts
expect(db.select().from(users).all()).toHaveLength(4);
expect(db.select().from(customers).all()).toHaveLength(15);
expect(db.select().from(contacts).all()).toHaveLength(14);
expect(db.select().from(products).all()).toHaveLength(21);
expect(db.select().from(priceRules).all()).toHaveLength(5);
expect(db.select().from(warehouses).all()).toHaveLength(3);
expect(db.select().from(inventory).all()).toHaveLength(12);
expect(db.select().from(quotes).all()).toHaveLength(7);
expect(db.select().from(quoteLines).all()).toHaveLength(7);
expect(db.select().from(orders).all()).toHaveLength(4);
expect(db.select().from(orderLines).all()).toHaveLength(4);
expect(db.select().from(stockReservations).all()).toHaveLength(4);
expect(db.select().from(opportunities).all()).toHaveLength(12);
expect(db.select().from(followUps).all()).toHaveLength(6);
```

并在文件顶部导入：

```ts
import { followUps, opportunities } from "./schema.js";
```

追加两个测试：

```ts
it("seeds the war room story", () => {
  const { db } = makeTestDb();
  const now = Date.now();
  seedDatabase(db, now);
  const huachen = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
  expect(huachen?.stage).toBe("quote");
  expect(huachen?.amountCents).toBe(28_000_000);
  expect(huachen?.riskLevel).toBe("high");
  const linkedQuote = db.select().from(quotes).where(eq(quotes.opportunityId, "o_huachen_server")).get();
  expect(linkedQuote?.totalCents).toBe(31_640_000);
  const srv = db.select().from(products).where(eq(products.sku, "SRV")).get();
  const stock = db.select().from(inventory).where(eq(inventory.productId, srv!.id)).all();
  expect(stock.reduce((sum, row) => sum + row.onHand - row.reserved, 0)).toBe(15);
});

it("seeds team sales for manager ranking", () => {
  const { db } = makeTestDb();
  const now = Date.now();
  seedDatabase(db, now);
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const rows = db.select().from(orders).all().filter((order) => order.createdAt >= monthStart.getTime());
  expect(rows.some((order) => order.ownerId === "u_sales_wang")).toBe(true);
  expect(rows.some((order) => order.ownerId === "u_sales_chen")).toBe(true);
});
```

同时更新两个受种子数量影响的既有断言：

- `apps/server/src/tools/write-tools.test.ts:95`：`expect(db.select().from(orders).all()).toHaveLength(1);` 改为 `toHaveLength(4);`（种子新增 3 笔历史订单）。
- `apps/server/src/routes/business.test.ts:362`：`expect(salesBody.metrics.customers).toBe(8);` 改为 `toBe(9);`（新增 `c_hengtai` 归小林）。

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/db/seed.test.ts`
Expected: FAIL，计数不符。

- [ ] **Step 3：扩展 seed-data.ts**

3.1 把 `users` 替换为：

```ts
export const users = [
  { id: "u_sales_lin", name: "小林", role: "sales" as const, teamId: "team_east", monthlyTargetCents: yuan(600_000) },
  { id: "u_manager_wang", name: "老王", role: "manager" as const, teamId: "team_east", monthlyTargetCents: 0 },
  { id: "u_sales_wang", name: "小王", role: "sales" as const, teamId: "team_east", monthlyTargetCents: yuan(500_000) },
  { id: "u_sales_chen", name: "小陈", role: "sales" as const, teamId: "team_east", monthlyTargetCents: yuan(600_000) },
];
```

3.2 在 `customers` 数组追加：

```ts
{ id: "c_zhihang", name: "智航电子", industry: "电子制造", level: "B" as const, ownerId: "u_sales_wang", region: "上海", creditLimitCents: yuan(400_000), creditUsedCents: yuan(120_000), paymentTerms: "月结 30 天", status: "active" },
{ id: "c_kaiyuan", name: "开源材料", industry: "新材料", level: "B" as const, ownerId: "u_sales_wang", region: "苏州", creditLimitCents: yuan(200_000), creditUsedCents: yuan(30_000), paymentTerms: "月结 45 天", status: "active" },
{ id: "c_haitong", name: "海通能源", industry: "能源", level: "A" as const, ownerId: "u_sales_chen", region: "成都", creditLimitCents: yuan(600_000), creditUsedCents: yuan(210_000), paymentTerms: "月结 60 天", status: "active" },
{ id: "c_yuantu", name: "远途物流", industry: "物流", level: "C" as const, ownerId: "u_sales_chen", region: "上海", creditLimitCents: yuan(80_000), creditUsedCents: yuan(20_000), paymentTerms: "月结 30 天", status: "active" },
{ id: "c_hengtai", name: "恒泰集团", industry: "制造", level: "A" as const, ownerId: "u_sales_lin", region: "上海", creditLimitCents: yuan(5_000_000), creditUsedCents: 186_099_915, paymentTerms: "月结 60 天", status: "active" },
{ id: "c_zhongke", name: "中科智造", industry: "智能制造", level: "A" as const, ownerId: "u_sales_wang", region: "苏州", creditLimitCents: yuan(3_000_000), creditUsedCents: 120_675_480, paymentTerms: "月结 45 天", status: "active" },
{ id: "c_huayun", name: "华云能源", industry: "能源", level: "A" as const, ownerId: "u_sales_chen", region: "成都", creditLimitCents: yuan(2_500_000), creditUsedCents: 87_448_830, paymentTerms: "月结 60 天", status: "active" },
```

3.3 在 `contacts` 数组追加：

```ts
{ id: "ct_liu_1", customerId: "c_zhihang", name: "刘总", title: "采购总监", phone: "131****2001", email: "liu@zhihang.example", isPrimary: true },
{ id: "ct_sun_1", customerId: "c_kaiyuan", name: "孙经理", title: "IT 经理", phone: "132****2002", email: "sun@kaiyuan.example", isPrimary: true },
{ id: "ct_zhou_1", customerId: "c_haitong", name: "周工", title: "设备科", phone: "133****2003", email: "zhou@haitong.example", isPrimary: true },
{ id: "ct_zheng_1", customerId: "c_yuantu", name: "郑总", title: "运营总监", phone: "134****2004", email: "zheng@yuantu.example", isPrimary: true },
{ id: "ct_he_1", customerId: "c_hengtai", name: "何总", title: "采购总监", phone: "135****2005", email: "he@hengtai.example", isPrimary: true },
{ id: "ct_ma_1", customerId: "c_zhongke", name: "马总", title: "IT 总监", phone: "136****2006", email: "ma@zhongke.example", isPrimary: true },
{ id: "ct_luo_1", customerId: "c_huayun", name: "罗经理", title: "采购经理", phone: "137****2007", email: "luo@huayun.example", isPrimary: true },
```

3.4 在 `products` 数组追加：

```ts
{ id: "p_srv", sku: "SRV", name: "SRV 机架式服务器", category: "服务器", unit: "台", listPriceCents: yuan(14_000), costCents: yuan(11_000), floorPriceCents: yuan(13_000), taxRateBps: 1300, status: "active" },
```

3.5 在 `inventoryRows` 数组追加：

```ts
{ warehouseId: "w_sh", productId: "p_srv", onHand: 5, reserved: 0, safetyStock: 10, etaDays: 5, version: 0 },
{ warehouseId: "w_sz", productId: "p_srv", onHand: 10, reserved: 0, safetyStock: 10, etaDays: 3, version: 0 },
{ warehouseId: "w_sh", productId: "p_t1", onHand: 100, reserved: 45, safetyStock: 10, etaDays: 2, version: 0 },
{ warehouseId: "w_cd", productId: "p_x5", onHand: 100, reserved: 40, safetyStock: 10, etaDays: 3, version: 0 },
{ warehouseId: "w_sh", productId: "p_m32", onHand: 100, reserved: 90, safetyStock: 10, etaDays: 1, version: 0 },
```

3.6 在 `buildQuoteSeeds(now)` 返回数组追加：

```ts
{ id: "q_seed_opp_huachen", quoteNo: "Q-2026-0100", customerId: "c_huachen", contactId: "ct_zhang_1", ownerId: "u_sales_lin", status: "approved", subtotalCents: 28_000_000, discountTotalCents: 0, taxTotalCents: 3_640_000, totalCents: 31_640_000, validUntil: now + 36 * 3600_000, riskFlags: "[]", notes: "服务器采购报价", createdAt: now - 5 * 86400_000, opportunityId: "o_huachen_server" },
{ id: "q_seed_lin_month", quoteNo: "Q-2026-0101", customerId: "c_hengtai", contactId: "ct_he_1", ownerId: "u_sales_lin", status: "converted", subtotalCents: 58_495_500, discountTotalCents: 0, taxTotalCents: 7_604_415, totalCents: 66_099_915, validUntil: now + 10 * 86400_000, riskFlags: "[]", notes: null, createdAt: now - 4 * 86400_000 },
{ id: "q_seed_wang_month", quoteNo: "Q-2026-0102", customerId: "c_zhongke", contactId: "ct_ma_1", ownerId: "u_sales_wang", status: "converted", subtotalCents: 35_996_000, discountTotalCents: 0, taxTotalCents: 4_679_480, totalCents: 40_675_480, validUntil: now + 10 * 86400_000, riskFlags: "[]", notes: null, createdAt: now - 6 * 86400_000 },
{ id: "q_seed_chen_month", quoteNo: "Q-2026-0103", customerId: "c_huayun", contactId: "ct_luo_1", ownerId: "u_sales_chen", status: "converted", subtotalCents: 24_291_000, discountTotalCents: 0, taxTotalCents: 3_157_830, totalCents: 27_448_830, validUntil: now + 10 * 86400_000, riskFlags: "[]", notes: null, createdAt: now - 8 * 86400_000 },
```

同时给已有 `q_seed_1` 增加 `opportunityId: "o_lingyun_laptop"`，给 `q_seed_2` 增加 `opportunityId: "o_boyuan_display"`。

3.7 在 `buildOrderSeeds(now)` 返回数组追加：

```ts
{ id: "o_seed_lin_month", orderNo: "SO-2026-0101", quoteId: "q_seed_lin_month", customerId: "c_hengtai", ownerId: "u_sales_lin", status: "reserved", totalCents: 66_099_915, paymentTerms: "月结 60 天", createdAt: now - 4 * 86400_000 },
{ id: "o_seed_wang_month", orderNo: "SO-2026-0102", quoteId: "q_seed_wang_month", customerId: "c_zhongke", ownerId: "u_sales_wang", status: "reserved", totalCents: 40_675_480, paymentTerms: "月结 45 天", createdAt: now - 6 * 86400_000 },
{ id: "o_seed_chen_month", orderNo: "SO-2026-0103", quoteId: "q_seed_chen_month", customerId: "c_huayun", ownerId: "u_sales_chen", status: "reserved", totalCents: 27_448_830, paymentTerms: "月结 60 天", createdAt: now - 8 * 86400_000 },
```

3.8 在 `quoteLineSeeds` 追加：

```ts
{ id: "ql_seed_opp_huachen", quoteId: "q_seed_opp_huachen", productId: "p_srv", quantity: 20, unitPriceCents: 1_400_000, discountRateBps: 0, lineTotalCents: 28_000_000, warehouseId: "w_sz" },
{ id: "ql_seed_lin_month", quoteId: "q_seed_lin_month", productId: "p_t1", quantity: 45, unitPriceCents: 1_299_900, discountRateBps: 0, lineTotalCents: 58_495_500, warehouseId: "w_sh" },
{ id: "ql_seed_wang_month", quoteId: "q_seed_wang_month", productId: "p_x5", quantity: 40, unitPriceCents: 899_900, discountRateBps: 0, lineTotalCents: 35_996_000, warehouseId: "w_cd" },
{ id: "ql_seed_chen_month", quoteId: "q_seed_chen_month", productId: "p_m32", quantity: 90, unitPriceCents: 269_900, discountRateBps: 0, lineTotalCents: 24_291_000, warehouseId: "w_sh" },
```

3.9 在 `orderLineSeeds` 追加：

```ts
{ id: "ol_seed_lin_month", orderId: "o_seed_lin_month", productId: "p_t1", quantity: 45, unitPriceCents: 1_299_900, warehouseId: "w_sh" },
{ id: "ol_seed_wang_month", orderId: "o_seed_wang_month", productId: "p_x5", quantity: 40, unitPriceCents: 899_900, warehouseId: "w_cd" },
{ id: "ol_seed_chen_month", orderId: "o_seed_chen_month", productId: "p_m32", quantity: 90, unitPriceCents: 269_900, warehouseId: "w_sh" },
```

3.10 在 `stockReservationSeeds` 追加：

```ts
{ id: "sr_seed_lin_month", orderId: "o_seed_lin_month", productId: "p_t1", warehouseId: "w_sh", quantity: 45, status: "active" },
{ id: "sr_seed_wang_month", orderId: "o_seed_wang_month", productId: "p_x5", warehouseId: "w_cd", quantity: 40, status: "active" },
{ id: "sr_seed_chen_month", orderId: "o_seed_chen_month", productId: "p_m32", warehouseId: "w_sh", quantity: 90, status: "active" },
```

3.11 追加商机与跟进种子函数：

```ts
export function buildOpportunitySeeds(now: number) {
  const day = 86_400_000;
  const hour = 3_600_000;
  const todayAt = (hourOfDay: number) => {
    const date = new Date(now);
    date.setHours(hourOfDay, 0, 0, 0);
    return date.getTime();
  };
  return [
    { id: "o_huachen_server", customerId: "c_huachen", ownerId: "u_sales_lin", name: "服务器采购", amountCents: 28_000_000, stage: "quote", probability: 70, expectedCloseDate: now + 20 * day, nextAction: "联系采购确认预算审批与交付时间", nextActionDueAt: todayAt(17), riskLevel: "high", lastFollowUpAt: now - 5 * day, createdAt: now - 30 * day, updatedAt: now - 5 * day },
    { id: "o_huachen_storage", customerId: "c_huachen", ownerId: "u_sales_lin", name: "存储扩容", amountCents: 12_000_000, stage: "solution", probability: 50, expectedCloseDate: now + 40 * day, nextAction: "确认扩容容量与预算", nextActionDueAt: now + 3 * day, riskLevel: "medium", lastFollowUpAt: now - 12 * day, createdAt: now - 45 * day, updatedAt: now - 12 * day },
    { id: "o_yuanshan_storage", customerId: "c_yuanshan", ownerId: "u_sales_lin", name: "存储扩容", amountCents: 12_000_000, stage: "negotiation", probability: 65, expectedCloseDate: now + 15 * day, nextAction: "发送最终报价", nextActionDueAt: todayAt(17), riskLevel: "low", lastFollowUpAt: now - 2 * hour, createdAt: now - 25 * day, updatedAt: now - 2 * hour },
    { id: "o_xinghe_maintenance", customerId: "c_xinghe", ownerId: "u_sales_lin", name: "年度维保", amountCents: 6_000_000, stage: "needs", probability: 30, expectedCloseDate: now + 30 * day, nextAction: "梳理设备清单", nextActionDueAt: now + 5 * day, riskLevel: "low", lastFollowUpAt: now - 3 * day, createdAt: now - 20 * day, updatedAt: now - 3 * day },
    { id: "o_haichuan_workstation", customerId: "c_haichuan", ownerId: "u_sales_lin", name: "移动工作站采购", amountCents: 15_000_000, stage: "needs", probability: 25, expectedCloseDate: now + 35 * day, nextAction: "确认预算来源", nextActionDueAt: now + 2 * day, riskLevel: "high", lastFollowUpAt: now - 4 * day, createdAt: now - 35 * day, updatedAt: now - 4 * day },
    { id: "o_lingyun_laptop", customerId: "c_lingyun", ownerId: "u_sales_lin", name: "笔记本采购", amountCents: 10_000_000, stage: "negotiation", probability: 60, expectedCloseDate: now + 10 * day, nextAction: "确认报价有效期", nextActionDueAt: now + 1 * day, riskLevel: "medium", lastFollowUpAt: now - 4 * day, createdAt: now - 18 * day, updatedAt: now - 4 * day },
    { id: "o_boyuan_display", customerId: "c_boyuan", ownerId: "u_sales_lin", name: "显示器采购", amountCents: 8_000_000, stage: "quote", probability: 40, expectedCloseDate: now + 20 * day, nextAction: "确认数量与交付批次", nextActionDueAt: now + 4 * day, riskLevel: "medium", lastFollowUpAt: now - 6 * day, createdAt: now - 22 * day, updatedAt: now - 6 * day },
    { id: "o_qingsong_edu", customerId: "c_qingsong", ownerId: "u_sales_lin", name: "教学设备采购", amountCents: 4_000_000, stage: "lead", probability: 10, expectedCloseDate: now + 60 * day, nextAction: "完成需求访谈", nextActionDueAt: now + 7 * day, riskLevel: "low", lastFollowUpAt: now - 10 * day, createdAt: now - 12 * day, updatedAt: now - 10 * day },
    { id: "o_zhihang_server", customerId: "c_zhihang", ownerId: "u_sales_wang", name: "服务器采购", amountCents: 22_000_000, stage: "quote", probability: 55, expectedCloseDate: now + 18 * day, nextAction: "确认采购预算", nextActionDueAt: todayAt(17), riskLevel: "high", lastFollowUpAt: now - 6 * day, createdAt: now - 28 * day, updatedAt: now - 6 * day },
    { id: "o_kaiyuan_network", customerId: "c_kaiyuan", ownerId: "u_sales_wang", name: "网络设备升级", amountCents: 9_000_000, stage: "negotiation", probability: 70, expectedCloseDate: now + 12 * day, nextAction: "发送合同草案", nextActionDueAt: now + 2 * day, riskLevel: "low", lastFollowUpAt: now - 1 * day, createdAt: now - 16 * day, updatedAt: now - 1 * day },
    { id: "o_haitong_meeting", customerId: "c_haitong", ownerId: "u_sales_chen", name: "会议设备采购", amountCents: 18_000_000, stage: "solution", probability: 40, expectedCloseDate: now + 25 * day, nextAction: "安排产品演示", nextActionDueAt: now + 3 * day, riskLevel: "medium", lastFollowUpAt: now - 3 * day, createdAt: now - 24 * day, updatedAt: now - 3 * day },
    { id: "o_yuantu_handheld", customerId: "c_yuantu", ownerId: "u_sales_chen", name: "手持终端采购", amountCents: 7_000_000, stage: "needs", probability: 20, expectedCloseDate: now + 45 * day, nextAction: "确认使用场景", nextActionDueAt: now + 6 * day, riskLevel: "low", lastFollowUpAt: now - 8 * day, createdAt: now - 14 * day, updatedAt: now - 8 * day },
  ];
}

export function buildFollowUpSeeds(now: number) {
  const day = 86_400_000;
  const hour = 3_600_000;
  return [
    { id: "f_huachen_1", customerId: "c_huachen", opportunityId: "o_huachen_server", actorId: "u_sales_lin", type: "call", content: "联系张总，客户询问交付周期", result: "客户希望下周五前交付", nextAction: "确认预算审批", nextActionDueAt: now + 2 * hour, createdAt: now - 5 * day },
    { id: "f_huachen_2", customerId: "c_huachen", opportunityId: "o_huachen_server", actorId: "u_sales_lin", type: "email", content: "发送服务器采购方案", result: "客户已查看", nextAction: null, nextActionDueAt: null, createdAt: now - 7 * day },
    { id: "f_yuanshan_1", customerId: "c_yuanshan", opportunityId: "o_yuanshan_storage", actorId: "u_sales_lin", type: "wechat", content: "客户回复需要最终报价", result: "客户刚回复，希望尽快给出最终价格", nextAction: "发送最终报价", nextActionDueAt: now + 2 * hour, createdAt: now - 2 * hour },
    { id: "f_zhihang_1", customerId: "c_zhihang", opportunityId: "o_zhihang_server", actorId: "u_sales_wang", type: "call", content: "确认采购预算", result: "预算尚未批复", nextAction: "再次确认预算", nextActionDueAt: now + 4 * hour, createdAt: now - 6 * day },
    { id: "f_lingyun_1", customerId: "c_lingyun", opportunityId: "o_lingyun_laptop", actorId: "u_sales_lin", type: "email", content: "跟进报价有效期", result: "客户要求延长 3 天", nextAction: "重新确认报价", nextActionDueAt: now + day, createdAt: now - 4 * day },
    { id: "f_huachen_storage_1", customerId: "c_huachen", opportunityId: "o_huachen_storage", actorId: "u_sales_lin", type: "meeting", content: "讨论存储扩容容量", result: "待客户确认", nextAction: "确认容量清单", nextActionDueAt: now + 3 * day, createdAt: now - 12 * day },
  ];
}
```

> TypeScript 提示：`buildOpportunitySeeds` / `buildFollowUpSeeds` 返回的对象里，`stage`、`riskLevel`、`type` 会被推断为 `string`。给每个值加 `as const`，或把函数返回类型标注为 `Array<typeof opportunities.$inferInsert>` / `Array<typeof followUps.$inferInsert>`，否则 `db.insert(...).values(...)` 会报类型不匹配。

- [ ] **Step 4：更新 seed.ts**

在导入中增加：

```ts
import { followUps, opportunities } from "./schema.js";
import { buildFollowUpSeeds, buildOpportunitySeeds } from "./seed-data.js";
```

在 `seedDatabase` 的库存写入之后追加：

```ts
db.insert(opportunities).values(buildOpportunitySeeds(now)).onConflictDoNothing().run();
db.insert(followUps).values(buildFollowUpSeeds(now)).onConflictDoNothing().run();
```

- [ ] **Step 5：更新 demo reset**

把 `apps/server/src/routes/demo.ts` 的 `tables` 数组改为：

```ts
const tables = [
  "follow_ups",
  "opportunities",
  "messages",
  "conversations",
  "trace_events",
  "traces",
  "audit_logs",
  "idempotency_keys",
  "confirmation_tokens",
  "after_sales_tickets",
  "approvals",
  "stock_reservations",
  "order_lines",
  "orders",
  "quote_lines",
  "quotes",
  "inventory",
  "warehouses",
  "price_rules",
  "products",
  "contacts",
  "customers",
  "users",
];
```

- [ ] **Step 6：运行测试确认通过**

Run: `pnpm --filter @salespilot/server exec vitest run src/db/seed.test.ts src/db/schema.test.ts`
Expected: PASS。

- [ ] **Step 7：重置本地演示库**

Run:

```bash
pnpm --filter @salespilot/server db:migrate
pnpm --filter @salespilot/server db:seed
```

Expected: `seed done`。

- [ ] **Step 8：提交**

```bash
git add apps/server/src/db/seed-data.ts apps/server/src/db/seed.ts apps/server/src/db/seed.test.ts apps/server/src/routes/demo.ts
git commit -m "feat: seed war room demo data"
```

---

## Task 4：优先级引擎

**Files:**
- Create: `apps/server/src/domain/priority.ts`
- Test: `apps/server/src/domain/priority.test.ts`

- [ ] **Step 1：写失败测试**

创建 `apps/server/src/domain/priority.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { deriveRiskLevel, scoreOpportunity, type PriorityInput } from "./priority.js";

const now = new Date("2026-11-07T10:00:00+08:00").getTime();
const day = 86_400_000;

function input(overrides: Partial<PriorityInput> = {}): PriorityInput {
  return {
    opportunityId: "o_test",
    customerId: "c_test",
    customerName: "测试客户",
    ownerId: "u_sales_lin",
    ownerName: "小林",
    name: "测试商机",
    amountCents: 10_000_000,
    stage: "needs",
    probability: 50,
    riskLevel: "low",
    nextAction: "跟进",
    nextActionDueAt: now + 3 * day,
    lastFollowUpAt: now - day,
    createdAt: now - 10 * day,
    signals: {
      creditUtilization: 0.2,
      quoteExpiringAt: null,
      stockShortage: false,
      recentCustomerReply: false,
    },
    ...overrides,
  };
}

describe("priority engine", () => {
  it("puts a large idle high-risk quote opportunity at P0", () => {
    const item = scoreOpportunity(
      input({
        amountCents: 28_000_000,
        stage: "quote",
        probability: 70,
        riskLevel: "high",
        lastFollowUpAt: now - 5 * day,
        nextActionDueAt: now + 2 * 3_600_000,
        signals: {
          creditUtilization: 0.92,
          quoteExpiringAt: now + 36 * 3_600_000,
          stockShortage: true,
          recentCustomerReply: false,
        },
      }),
      now,
    );
    expect(item.priority).toBe("P0");
    expect(item.score).toBeGreaterThanOrEqual(60);
    expect(item.reasons.join(" ")).toContain("未跟进");
    expect(item.reasons.join(" ")).toContain("信用");
    expect(item.suggestedAction).toContain("备货");
  });

  it("marks a recently replied opportunity as P1", () => {
    const item = scoreOpportunity(
      input({
        amountCents: 12_000_000,
        stage: "negotiation",
        probability: 65,
        lastFollowUpAt: now - 2 * 3_600_000,
        nextActionDueAt: now + 2 * 3_600_000,
        signals: {
          creditUtilization: 0.2,
          quoteExpiringAt: null,
          stockShortage: false,
          recentCustomerReply: true,
        },
      }),
      now,
    );
    expect(item.priority).toBe("P1");
    expect(item.reasons.join(" ")).toContain("回复");
    expect(item.suggestedAction).toContain("下一版");
  });

  it("keeps a small early-stage opportunity at P2", () => {
    const item = scoreOpportunity(
      input({
        amountCents: 6_000_000,
        stage: "needs",
        probability: 30,
        lastFollowUpAt: now - 3 * day,
        nextActionDueAt: now + 5 * day,
      }),
      now,
    );
    expect(item.priority).toBe("P2");
  });

  it("escalates risk from signals", () => {
    expect(deriveRiskLevel("low", { creditUtilization: 0.95, quoteExpiringAt: null, stockShortage: false })).toBe("high");
    expect(deriveRiskLevel("low", { creditUtilization: 0.82, quoteExpiringAt: null, stockShortage: false })).toBe("medium");
    expect(deriveRiskLevel("medium", { creditUtilization: 0.2, quoteExpiringAt: now + 3_600_000, stockShortage: false })).toBe("medium");
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/domain/priority.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3：实现 priority.ts**

创建 `apps/server/src/domain/priority.ts`：

```ts
import type { OpportunityStage, PriorityItem, PriorityLevel, RiskLevel } from "@salespilot/shared";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const AMOUNT_CAP_CENTS = 30_000_000;
const ACTIVE_STAGES: OpportunityStage[] = ["lead", "needs", "solution", "quote", "negotiation"];

export interface PrioritySignalsInput {
  creditUtilization: number | null;
  quoteExpiringAt: number | null;
  stockShortage: boolean;
  recentCustomerReply: boolean;
}

export interface PriorityInput {
  opportunityId: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  amountCents: number;
  stage: OpportunityStage;
  probability: number;
  riskLevel: RiskLevel;
  nextAction: string | null;
  nextActionDueAt: number | null;
  lastFollowUpAt: number | null;
  createdAt: number;
  signals: PrioritySignalsInput;
}

const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function isActiveStage(stage: OpportunityStage) {
  return ACTIVE_STAGES.includes(stage);
}

export function deriveRiskLevel(stored: RiskLevel, signals: Omit<PrioritySignalsInput, "recentCustomerReply">): RiskLevel {
  let derived: RiskLevel = "low";
  if (signals.creditUtilization !== null && signals.creditUtilization >= 0.9) derived = "high";
  else if (signals.creditUtilization !== null && signals.creditUtilization >= 0.8) derived = "medium";
  if (signals.stockShortage) derived = "high";
  if (signals.quoteExpiringAt !== null && RISK_RANK[derived] < RISK_RANK.medium) derived = "medium";
  return RISK_RANK[derived] > RISK_RANK[stored] ? derived : stored;
}

function buildReasons(input: PriorityInput, now: number, idleDays: number, overdueDays: number, riskLevel: RiskLevel) {
  const reasons: string[] = [];
  if (overdueDays > 0) reasons.push(`下一步已逾期 ${Math.max(1, Math.ceil(overdueDays))} 天`);
  else if (input.nextActionDueAt !== null && input.nextActionDueAt >= startOfDay(now) && input.nextActionDueAt < startOfDay(now) + DAY_MS) {
    reasons.push("下一步今天到期");
  }
  if (idleDays >= 3) reasons.push(`已 ${Math.floor(idleDays)} 天未跟进`);
  if (input.signals.creditUtilization !== null && input.signals.creditUtilization >= 0.8) {
    reasons.push(`信用已用 ${Math.round(input.signals.creditUtilization * 100)}%`);
  }
  if (input.signals.quoteExpiringAt !== null) {
    reasons.push(`报价将在 ${Math.max(1, Math.ceil((input.signals.quoteExpiringAt - now) / HOUR_MS))} 小时内到期`);
  }
  if (input.signals.stockShortage) reasons.push("关联 SKU 可用库存低于需求");
  if (input.signals.recentCustomerReply) reasons.push("客户今天有回复");
  if (riskLevel === "high") reasons.push("综合风险等级为高");
  if (reasons.length === 0) reasons.push("商机处于活跃阶段");
  return reasons.slice(0, 4);
}

function buildSuggestedAction(input: PriorityInput, now: number, overdueDays: number) {
  const actions: string[] = [];
  if (input.signals.stockShortage && (input.stage === "quote" || input.stage === "negotiation")) {
    actions.push("先确认客户预算与交付时间，再决定是否申请备货或调拨");
  }
  if (input.signals.creditUtilization !== null && input.signals.creditUtilization >= 0.8) {
    actions.push("确认回款或申请信用审批后再推进");
  }
  if (input.signals.quoteExpiringAt !== null) {
    actions.push("今天联系客户确认报价，必要时重新出价");
  }
  if (input.signals.recentCustomerReply) {
    actions.push("按客户最新回复发送下一版方案或报价");
  }
  const idleDays = (now - (input.lastFollowUpAt ?? input.createdAt)) / DAY_MS;
  if (overdueDays > 0 || idleDays >= 3) actions.push("今天电话联系客户确认下一步");
  if (actions.length === 0) {
    const byStage: Record<OpportunityStage, string> = {
      lead: "完成需求访谈并确认预算",
      needs: "确认需求清单与决策人",
      solution: "安排方案沟通并确认时间表",
      quote: "确认客户对报价的反馈",
      negotiation: "推动合同与交付条款确认",
      won: "确认交付与回款计划",
      lost: "复盘丢单原因",
    };
    actions.push(byStage[input.stage]);
  }
  return actions.slice(0, 2).join("；");
}

export function scoreOpportunity(input: PriorityInput, now = Date.now()): PriorityItem {
  const idleDays = Math.max(0, (now - (input.lastFollowUpAt ?? input.createdAt)) / DAY_MS);
  const overdueDays =
    input.nextActionDueAt !== null && input.nextActionDueAt < now
      ? Math.max(0.5, (now - input.nextActionDueAt) / DAY_MS)
      : 0;
  const dueSoon =
    input.nextActionDueAt !== null &&
    input.nextActionDueAt >= now &&
    input.nextActionDueAt >= startOfDay(now) &&
    input.nextActionDueAt < startOfDay(now) + DAY_MS
      ? 0.3
      : 0;
  const urgency = clamp(Math.max(idleDays / 7, overdueDays / 2, dueSoon), 0, 1);
  const riskLevel = deriveRiskLevel(input.riskLevel, input.signals);
  const riskFactor = riskLevel === "high" ? 1 : riskLevel === "medium" ? 0.7 : 0.4;
  const amountNorm = clamp(input.amountCents / AMOUNT_CAP_CENTS, 0, 1);
  const probabilityNorm = clamp(input.probability / 100, 0, 1);
  const score = Math.round(100 * (0.4 * amountNorm + 0.25 * probabilityNorm + 0.2 * urgency + 0.15 * riskFactor));
  const priority: PriorityLevel = score >= 60 ? "P0" : score >= 40 ? "P1" : "P2";

  return {
    opportunityId: input.opportunityId,
    customerId: input.customerId,
    customerName: input.customerName,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    name: input.name,
    amountCents: input.amountCents,
    stage: input.stage,
    probability: input.probability,
    riskLevel,
    priority,
    score,
    reasons: buildReasons(input, now, idleDays, overdueDays, riskLevel),
    suggestedAction: buildSuggestedAction(input, now, overdueDays),
    nextAction: input.nextAction,
    nextActionDueAt: input.nextActionDueAt,
    lastFollowUpAt: input.lastFollowUpAt,
    signals: {
      creditUtilization: input.signals.creditUtilization,
      quoteExpiringAt: input.signals.quoteExpiringAt,
      stockShortage: input.signals.stockShortage,
      recentCustomerReply: input.signals.recentCustomerReply,
      idleDays,
      overdueDays,
    },
  };
}
```

注意：`buildSuggestedAction` 使用 `Date.now()`，测试中固定 `now` 会导致 idle 计算不一致。把 `now` 作为参数传入：

```ts
function buildSuggestedAction(input: PriorityInput, now: number, overdueDays: number) {
  // ...
  const idleDays = (now - (input.lastFollowUpAt ?? input.createdAt)) / DAY_MS;
  const overdue = overdueDays > 0;
}
```

并在 `scoreOpportunity` 中调用 `buildSuggestedAction(input, now, overdueDays)`。

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm --filter @salespilot/server exec vitest run src/domain/priority.test.ts`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/domain/priority.ts apps/server/src/domain/priority.test.ts
git commit -m "feat: add explainable opportunity priority engine"
```

---

## Task 5：作战室聚合服务

**Files:**
- Create: `apps/server/src/domain/workspace.ts`
- Test: `apps/server/src/domain/workspace.test.ts`

- [ ] **Step 1：写失败测试**

创建 `apps/server/src/domain/workspace.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import type { Actor } from "@salespilot/shared";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { buildCustomerAssessment, buildOpportunityDetail, buildWorkspace, listOpportunityViews } from "./workspace.js";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };
const manager: Actor = { id: "u_manager_wang", name: "老王", role: "manager", teamId: "team_east" };

function setup(actor: Actor = sales) {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return { db, sqlite, actor };
}

describe("workspace service", () => {
  it("puts 华辰服务器采购 first for the sales rep", () => {
    const { db, actor } = setup();
    const workspace = buildWorkspace(db, actor);
    expect(workspace.scope).toBe("self");
    expect(workspace.priorities[0].customerName).toBe("华辰设计");
    expect(workspace.priorities[0].name).toBe("服务器采购");
    expect(workspace.priorities[0].priority).toBe("P0");
    expect(workspace.priorities[0].reasons.length).toBeGreaterThan(0);
    expect(workspace.metrics.activeOpportunities).toBeGreaterThanOrEqual(8);
    expect(workspace.metrics.highRiskOpportunities).toBeGreaterThan(0);
  });

  it("returns team metrics and ranking for a manager", () => {
    const { db, actor } = setup(manager);
    const workspace = buildWorkspace(db, actor);
    expect(workspace.scope).toBe("team");
    expect(workspace.ranking?.length).toBeGreaterThanOrEqual(3);
    expect(workspace.ranking?.[0].monthSalesCents).toBeGreaterThan(0);
    expect(workspace.metrics.pendingApprovals).toBeGreaterThanOrEqual(0);
  });

  it("builds a customer assessment with signals", () => {
    const { db, actor } = setup();
    const assessment = buildCustomerAssessment(db, actor, "c_huachen");
    expect(assessment.summary).toBeTruthy();
    expect(assessment.risks.length).toBeGreaterThan(0);
    expect(assessment.suggestion).toContain("备货");
    expect(assessment.nextAction).toContain("预算");
  });

  it("returns opportunity detail and enforces scope", () => {
    const { db, actor } = setup();
    const detail = buildOpportunityDetail(db, actor, "o_huachen_server");
    expect(detail.opportunity.id).toBe("o_huachen_server");
    expect(detail.priority.priority).toBe("P0");
    expect(detail.followUps.length).toBeGreaterThan(0);
    expect(() => buildOpportunityDetail(db, actor, "o_zhihang_server")).toThrow();
  });

  it("lists opportunities with filters", () => {
    const { db, actor } = setup();
    const all = listOpportunityViews(db, actor, {});
    expect(all.length).toBe(8);
    const quoteStage = listOpportunityViews(db, actor, { stage: "quote" });
    expect(quoteStage.every((row) => row.stage === "quote")).toBe(true);
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/domain/workspace.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3：实现 workspace.ts**

创建 `apps/server/src/domain/workspace.ts`。完整实现如下：

```ts
import { and, desc, eq, getTableColumns, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { AppError, type Actor, type OpportunityStage, type PriorityItem, type RiskLevel, type TodoItem } from "@salespilot/shared";
import type { Db } from "../db/client.js";
import {
  afterSalesTickets,
  approvals,
  customers,
  followUps,
  inventory,
  opportunities,
  orders,
  products,
  quoteLines,
  quotes,
  users,
} from "../db/schema.js";
import { scopedOwnerIds, teamOwnerIds } from "../lib/actor.js";
import { isActiveStage, scoreOpportunity, type PriorityInput } from "./priority.js";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const ACTIVE_STAGES: OpportunityStage[] = ["lead", "needs", "solution", "quote", "negotiation"];

export interface WorkspaceMetrics {
  monthSalesCents: number;
  monthTargetCents: number;
  completionRate: number;
  expectedCloseCents: number;
  activeOpportunities: number;
  highRiskOpportunities: number;
  pendingApprovals: number;
  todayFollowUps: number;
  overdueFollowUps: number;
}

export interface SalesRankingRow {
  ownerId: string;
  ownerName: string;
  monthSalesCents: number;
  pipelineCents: number;
  targetCents: number;
  completionRate: number;
  trend: "up" | "flat" | "down";
}

export interface WorkspaceTodoGroups {
  today: TodoItem[];
  overdue: TodoItem[];
  approvals: TodoItem[];
  quotesToAdvance: TodoItem[];
  quotesExpiring: TodoItem[];
  tickets: TodoItem[];
  orders: TodoItem[];
}

export interface WorkspaceData {
  scope: "self" | "team";
  actor: Actor;
  metrics: WorkspaceMetrics;
  headline: string;
  priorities: PriorityItem[];
  todos: WorkspaceTodoGroups;
  risks: PriorityItem[];
  ranking?: SalesRankingRow[];
  recentQuotes: Array<typeof quotes.$inferSelect & { customerName: string | null; ownerName: string | null }>;
  recentOrders: Array<typeof orders.$inferSelect & { customerName: string | null; ownerName: string | null }>;
}

export interface CustomerAssessment {
  summary: string;
  positiveSignals: string[];
  risks: string[];
  suggestion: string;
  nextAction: string | null;
}

export interface OpportunityView {
  id: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  amountCents: number;
  stage: OpportunityStage;
  probability: number;
  expectedCloseDate: number;
  nextAction: string | null;
  nextActionDueAt: number | null;
  riskLevel: RiskLevel;
  lastFollowUpAt: number | null;
  createdAt: number;
  updatedAt: number;
  priority: PriorityItem["priority"] | null;
  score: number | null;
  reasons: string[];
  suggestedAction: string | null;
}

function startOfMonth(now: number) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function startOfDay(now: number) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfDay(now: number) {
  return startOfDay(now) + DAY_MS - 1;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function quoteExpiringAt(quote: typeof quotes.$inferSelect | undefined, now: number) {
  if (!quote || quote.status !== "approved") return null;
  if (quote.validUntil <= now || quote.validUntil > now + 48 * HOUR_MS) return null;
  return quote.validUntil;
}

function stockShortageForQuote(db: Db, quote: typeof quotes.$inferSelect | undefined) {
  if (!quote) return false;
  const lines = db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).all();
  return lines.some((line) => {
    const rows = db.select().from(inventory).where(eq(inventory.productId, line.productId)).all();
    const available = sum(rows.map((row) => row.onHand - row.reserved));
    const safety = rows.reduce((max, row) => Math.max(max, row.safetyStock), 0);
    return available < Math.max(line.quantity, safety);
  });
}

function linkedQuote(db: Db, opportunityId: string, customerId: string) {
  const linked = db.select().from(quotes).where(eq(quotes.opportunityId, opportunityId)).orderBy(desc(quotes.createdAt)).get();
  if (linked) return linked;
  // 只回退到未绑定任何商机的客户报价，避免把别的商机报价信号算到当前商机头上。
  return db
    .select()
    .from(quotes)
    .where(and(eq(quotes.customerId, customerId), eq(quotes.status, "approved"), isNull(quotes.opportunityId)))
    .orderBy(desc(quotes.createdAt))
    .get();
}

function recentReply(db: Db, customerId: string, opportunityId: string, now: number) {
  return db
    .select()
    .from(followUps)
    .where(and(eq(followUps.customerId, customerId), gte(followUps.createdAt, now - 24 * HOUR_MS)))
    .all()
    .concat(
      db
        .select()
        .from(followUps)
        .where(and(eq(followUps.opportunityId, opportunityId), gte(followUps.createdAt, now - 24 * HOUR_MS)))
        .all(),
    )
    .some((row) => !!row.result && row.result.trim().length > 0);
}

function toPriorityInput(
  db: Db,
  row: {
    opportunity: typeof opportunities.$inferSelect;
    customerName: string;
    ownerName: string | null;
    creditLimitCents: number;
    creditUsedCents: number;
  },
  now: number,
): PriorityInput {
  const quote = linkedQuote(db, row.opportunity.id, row.opportunity.customerId);
  return {
    opportunityId: row.opportunity.id,
    customerId: row.opportunity.customerId,
    customerName: row.customerName,
    ownerId: row.opportunity.ownerId,
    ownerName: row.ownerName,
    name: row.opportunity.name,
    amountCents: row.opportunity.amountCents,
    stage: row.opportunity.stage,
    probability: row.opportunity.probability,
    riskLevel: row.opportunity.riskLevel,
    nextAction: row.opportunity.nextAction,
    nextActionDueAt: row.opportunity.nextActionDueAt,
    lastFollowUpAt: row.opportunity.lastFollowUpAt,
    createdAt: row.opportunity.createdAt,
    signals: {
      creditUtilization: row.creditLimitCents > 0 ? row.creditUsedCents / row.creditLimitCents : null,
      quoteExpiringAt: quoteExpiringAt(quote, now),
      stockShortage: stockShortageForQuote(db, quote),
      recentCustomerReply: recentReply(db, row.opportunity.customerId, row.opportunity.id, now),
    },
  };
}

function loadActiveRows(db: Db, ownerIds: string[]) {
  return db
    .select({
      opportunity: opportunities,
      customerName: customers.name,
      ownerName: users.name,
      creditLimitCents: customers.creditLimitCents,
      creditUsedCents: customers.creditUsedCents,
    })
    .from(opportunities)
    .innerJoin(customers, eq(opportunities.customerId, customers.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(and(inArray(opportunities.ownerId, ownerIds), inArray(opportunities.stage, ACTIVE_STAGES)))
    .all();
}

function buildHeadline(priorities: PriorityItem[]) {
  if (priorities.length === 0) return "今天没有需要紧急推进的商机，可以整理客户资料或开发新线索。";
  const top = priorities.slice(0, 3).map((item) => `${item.customerName}${item.name}`);
  return `今天有 ${priorities.length} 个商机值得优先推进：${top.join("、")}。`;
}

function buildTodos(
  db: Db,
  actor: Actor,
  ownerIds: string[],
  priorities: PriorityItem[],
  now: number,
): WorkspaceTodoGroups {
  const todayEnd = endOfDay(now);
  const todayStart = startOfDay(now);
  const todoFromPriority = (item: PriorityItem, kind: TodoItem["kind"]): TodoItem => ({
    id: `${kind}_${item.opportunityId}`,
    kind,
    title: `${item.customerName} · ${item.name}`,
    subtitle: item.suggestedAction,
    customerId: item.customerId,
    opportunityId: item.opportunityId,
    amountCents: item.amountCents,
    dueAt: item.nextActionDueAt ?? undefined,
    severity: item.priority === "P0" ? "blocker" : item.priority === "P1" ? "warning" : "info",
    href: `/opportunities/${item.opportunityId}`,
  });

  const today = priorities
    .filter((item) => item.nextActionDueAt !== null && item.nextActionDueAt >= todayStart && item.nextActionDueAt <= todayEnd)
    .map((item) => todoFromPriority(item, "today_follow_up"));
  const overdue = priorities
    .filter((item) => item.nextActionDueAt !== null && item.nextActionDueAt < todayStart)
    .map((item) => todoFromPriority(item, "overdue_follow_up"));

  const pendingApprovals = db
    .select()
    .from(approvals)
    .where(and(inArray(approvals.requesterId, ownerIds), eq(approvals.status, "pending")))
    .orderBy(desc(approvals.createdAt))
    .all()
    .map((row) => {
      const quote = row.targetType === "quote" ? db.select().from(quotes).where(eq(quotes.id, row.targetId)).get() : undefined;
      const customer = quote ? db.select().from(customers).where(eq(customers.id, quote.customerId)).get() : undefined;
      return {
        id: `approval_${row.id}`,
        kind: "approval" as const,
        title: customer ? `${customer.name} · 待审批` : "待审批",
        subtitle: row.reason,
        customerId: customer?.id,
        amountCents: quote?.totalCents,
        severity: "blocker" as const,
        href: "/approvals",
      };
    });

  const quotesToAdvance = db
    .select()
    .from(quotes)
    .where(and(inArray(quotes.ownerId, ownerIds), eq(quotes.status, "approved"), lt(quotes.createdAt, now - 2 * DAY_MS)))
    .orderBy(desc(quotes.createdAt))
    .limit(10)
    .all()
    .map((quote) => {
      const customer = db.select().from(customers).where(eq(customers.id, quote.customerId)).get();
      return {
        id: `quote_advance_${quote.id}`,
        kind: "quote_to_advance" as const,
        title: `${customer?.name ?? "客户"} · ${quote.quoteNo}`,
        subtitle: "报价已批准但尚未转订单，建议确认客户决策进度",
        customerId: quote.customerId,
        amountCents: quote.totalCents,
        severity: "warning" as const,
        href: `/quotes/${quote.id}`,
      };
    });

  const quotesExpiring = db
    .select()
    .from(quotes)
    .where(and(inArray(quotes.ownerId, ownerIds), eq(quotes.status, "approved"), gte(quotes.validUntil, now), lte(quotes.validUntil, now + 48 * HOUR_MS)))
    .orderBy(quotes.validUntil)
    .all()
    .map((quote) => {
      const customer = db.select().from(customers).where(eq(customers.id, quote.customerId)).get();
      return {
        id: `quote_expiring_${quote.id}`,
        kind: "quote_expiring" as const,
        title: `${customer?.name ?? "客户"} · ${quote.quoteNo}`,
        subtitle: "报价将在 48 小时内到期",
        customerId: quote.customerId,
        amountCents: quote.totalCents,
        dueAt: quote.validUntil,
        severity: "warning" as const,
        href: `/quotes/${quote.id}`,
      };
    });

  const tickets = db
    .select({ ticket: afterSalesTickets, customerName: customers.name })
    .from(afterSalesTickets)
    .innerJoin(customers, eq(afterSalesTickets.customerId, customers.id))
    .where(and(inArray(customers.ownerId, ownerIds), inArray(afterSalesTickets.status, ["open", "processing"])))
    .orderBy(desc(afterSalesTickets.createdAt))
    .limit(10)
    .all()
    .map((row) => ({
      id: `ticket_${row.ticket.id}`,
      kind: "ticket" as const,
      title: `${row.customerName} · ${row.ticket.ticketNo}`,
      subtitle: row.ticket.description,
      customerId: row.ticket.customerId,
      severity: "info" as const,
      href: `/tickets/${row.ticket.id}`,
    }));

  const pendingOrders = db
    .select()
    .from(orders)
    .where(and(inArray(orders.ownerId, ownerIds), eq(orders.status, "pending_approval")))
    .orderBy(desc(orders.createdAt))
    .limit(10)
    .all()
    .map((order) => {
      const customer = db.select().from(customers).where(eq(customers.id, order.customerId)).get();
      return {
        id: `order_${order.id}`,
        kind: "order" as const,
        title: `${customer?.name ?? "客户"} · ${order.orderNo}`,
        subtitle: "订单待确认，建议尽快处理",
        customerId: order.customerId,
        amountCents: order.totalCents,
        severity: "warning" as const,
        href: `/orders/${order.id}`,
      };
    });

  return { today, overdue, approvals: pendingApprovals, quotesToAdvance, quotesExpiring, tickets, orders: pendingOrders };
}

function buildRanking(db: Db, teamUsers: Array<typeof users.$inferSelect>, now: number): SalesRankingRow[] {
  const monthStart = startOfMonth(now);
  return teamUsers
    .filter((user) => user.role === "sales")
    .map((user) => {
      const sales = sum(
        db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.ownerId, user.id),
              gte(orders.createdAt, monthStart),
              inArray(orders.status, ["reserved", "fulfilled"]),
            ),
          )
          .all()
          .map((order) => order.totalCents),
      );
      const pipeline = sum(
        db
          .select()
          .from(opportunities)
          .where(and(eq(opportunities.ownerId, user.id), inArray(opportunities.stage, ACTIVE_STAGES)))
          .all()
          .map((item) => Math.round((item.amountCents * item.probability) / 100)),
      );
      const target = user.monthlyTargetCents;
      const completionRate = target > 0 ? sales / target : 0;
      const trend = completionRate >= 0.8 ? "up" : completionRate >= 0.5 ? "flat" : "down";
      return {
        ownerId: user.id,
        ownerName: user.name,
        monthSalesCents: sales,
        pipelineCents: pipeline,
        targetCents: target,
        completionRate,
        trend: trend as SalesRankingRow["trend"],
      };
    })
    .sort((a, b) => b.monthSalesCents - a.monthSalesCents);
}

export function buildWorkspace(
  db: Db,
  actor: Actor,
  options: { now?: number; scope?: "self" | "team" } = {},
): WorkspaceData {
  const now = options.now ?? Date.now();
  const scope = options.scope ?? (actor.role === "manager" ? "team" : "self");
  const ownerIds = scope === "team" && actor.role === "manager" ? teamOwnerIds(db, actor) : [actor.id];
  const rows = loadActiveRows(db, ownerIds);
  const ranked = rows
    .map((row) => scoreOpportunity(toPriorityInput(db, row, now), now))
    .sort((a, b) => b.score - a.score);
  // 作战室按“客户”展示，避免同一客户的两个商机挤占全部建议位。
  const priorities: PriorityItem[] = [];
  const seenCustomers = new Set<string>();
  for (const item of ranked) {
    if (seenCustomers.has(item.customerId)) continue;
    seenCustomers.add(item.customerId);
    priorities.push(item);
  }
  const monthStart = startOfMonth(now);
  const monthSalesCents = sum(
    db
      .select()
      .from(orders)
      .where(and(inArray(orders.ownerId, ownerIds), gte(orders.createdAt, monthStart), inArray(orders.status, ["reserved", "fulfilled"])))
      .all()
      .map((order) => order.totalCents),
  );
  const monthTargetCents = sum(
    db.select().from(users).where(inArray(users.id, ownerIds)).all().map((user) => user.monthlyTargetCents),
  );
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const active = ranked;
  const metrics: WorkspaceMetrics = {
    monthSalesCents,
    monthTargetCents,
    completionRate: monthTargetCents > 0 ? monthSalesCents / monthTargetCents : 0,
    expectedCloseCents: sum(active.map((item) => Math.round((item.amountCents * item.probability) / 100))),
    activeOpportunities: active.length,
    highRiskOpportunities: active.filter((item) => item.riskLevel === "high").length,
    pendingApprovals: db
      .select()
      .from(approvals)
      .where(and(inArray(approvals.requesterId, ownerIds), eq(approvals.status, "pending")))
      .all().length,
    todayFollowUps: active.filter((item) => item.nextActionDueAt !== null && item.nextActionDueAt >= todayStart && item.nextActionDueAt <= todayEnd).length,
    overdueFollowUps: active.filter((item) => item.nextActionDueAt !== null && item.nextActionDueAt < todayStart).length,
  };
  const recentQuotes = db
    .select({ ...getTableColumns(quotes), customerName: customers.name, ownerName: users.name })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(users, eq(quotes.ownerId, users.id))
    .where(inArray(quotes.ownerId, ownerIds))
    .orderBy(desc(quotes.createdAt))
    .limit(5)
    .all();
  const recentOrders = db
    .select({ ...getTableColumns(orders), customerName: customers.name, ownerName: users.name })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(users, eq(orders.ownerId, users.id))
    .where(inArray(orders.ownerId, ownerIds))
    .orderBy(desc(orders.createdAt))
    .limit(5)
    .all();
  const teamUsers = db.select().from(users).where(eq(users.teamId, actor.teamId)).all();

  return {
    scope,
    actor,
    metrics,
    headline: buildHeadline(priorities),
    priorities: priorities.slice(0, 5),
    todos: buildTodos(db, actor, ownerIds, ranked, now),
    risks: ranked.filter((item) => item.riskLevel === "high" || item.priority === "P0").slice(0, 5),
    ranking: actor.role === "manager" ? buildRanking(db, teamUsers, now) : undefined,
    recentQuotes,
    recentOrders,
  };
}

export function buildCustomerAssessment(db: Db, actor: Actor, customerId: string, now = Date.now()): CustomerAssessment {
  const customer = db.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
  if (!scopedOwnerIds(db, actor).includes(customer.ownerId)) throw new AppError("FORBIDDEN", "无权访问该客户");
  const items = listOpportunityViews(db, actor, { customerId }, now).filter((row) => row.priority !== null);
  const top = items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const positiveSignals: string[] = [];
  const risks: string[] = [];
  if (top) {
    if (top.probability >= 60) positiveSignals.push(`成交概率 ${top.probability}%`);
    if (["solution", "quote", "negotiation"].includes(top.stage)) positiveSignals.push(`已进入${top.stage === "quote" ? "报价" : top.stage === "negotiation" ? "谈判" : "方案"}阶段`);
    if (top.reasons.some((reason) => reason.includes("回复"))) positiveSignals.push("客户近期有回复");
    risks.push(...top.reasons.filter((reason) => !reason.includes("回复")));
  }
  if (customer.creditLimitCents > 0 && customer.creditUsedCents / customer.creditLimitCents >= 0.8) {
    risks.push(`信用已用 ${Math.round((customer.creditUsedCents / customer.creditLimitCents) * 100)}%`);
  }
  const summary = top
    ? `${customer.name}当前有 ${items.length} 个进行中商机，最高优先级是「${top.name}」¥${(top.amountCents / 100).toLocaleString("zh-CN")}。`
    : `${customer.name}暂无进行中商机。`;
  return {
    summary,
    positiveSignals: [...new Set(positiveSignals)].slice(0, 4),
    risks: [...new Set(risks)].slice(0, 4),
    suggestion: top?.suggestedAction ?? "先确认客户需求与决策人，再创建商机。",
    nextAction: top?.nextAction ?? null,
  };
}

export function buildOpportunityDetail(db: Db, actor: Actor, opportunityId: string, now = Date.now()) {
  const row = db
    .select({
      opportunity: opportunities,
      customerName: customers.name,
      ownerName: users.name,
      creditLimitCents: customers.creditLimitCents,
      creditUsedCents: customers.creditUsedCents,
    })
    .from(opportunities)
    .innerJoin(customers, eq(opportunities.customerId, customers.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(eq(opportunities.id, opportunityId))
    .get();
  if (!row) throw new AppError("NOT_FOUND", "商机不存在");
  if (!scopedOwnerIds(db, actor).includes(row.opportunity.ownerId)) throw new AppError("FORBIDDEN", "无权访问该商机");
  const priority = scoreOpportunity(toPriorityInput(db, row, now), now);
  const relatedQuotes = db.select().from(quotes).where(eq(quotes.opportunityId, opportunityId)).orderBy(desc(quotes.createdAt)).all();
  const relatedOrders = db.select().from(orders).where(eq(orders.opportunityId, opportunityId)).orderBy(desc(orders.createdAt)).all();
  const history = db
    .select()
    .from(followUps)
    .where(or(eq(followUps.opportunityId, opportunityId), eq(followUps.customerId, row.opportunity.customerId)))
    .orderBy(desc(followUps.createdAt))
    .limit(20)
    .all();
  return {
    opportunity: row.opportunity,
    customer: db.select().from(customers).where(eq(customers.id, row.opportunity.customerId)).get()!,
    quotes: relatedQuotes,
    orders: relatedOrders,
    followUps: history,
    priority,
    assessment: buildCustomerAssessment(db, actor, row.opportunity.customerId, now),
  };
}

export function listOpportunityViews(
  db: Db,
  actor: Actor,
  filters: { stage?: OpportunityStage; risk?: RiskLevel; customerId?: string; ownerId?: string } = {},
  now = Date.now(),
): OpportunityView[] {
  const ownerIds = scopedOwnerIds(db, actor);
  const conditions = [inArray(opportunities.ownerId, ownerIds)];
  if (filters.stage) conditions.push(eq(opportunities.stage, filters.stage));
  if (filters.risk) conditions.push(eq(opportunities.riskLevel, filters.risk));
  if (filters.customerId) conditions.push(eq(opportunities.customerId, filters.customerId));
  if (filters.ownerId) conditions.push(eq(opportunities.ownerId, filters.ownerId));
  return db
    .select({
      opportunity: opportunities,
      customerName: customers.name,
      ownerName: users.name,
      creditLimitCents: customers.creditLimitCents,
      creditUsedCents: customers.creditUsedCents,
    })
    .from(opportunities)
    .innerJoin(customers, eq(opportunities.customerId, customers.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(opportunities.updatedAt))
    .all()
    .map((row) => {
      const base = {
        id: row.opportunity.id,
        customerId: row.opportunity.customerId,
        customerName: row.customerName,
        ownerId: row.opportunity.ownerId,
        ownerName: row.ownerName,
        name: row.opportunity.name,
        amountCents: row.opportunity.amountCents,
        stage: row.opportunity.stage,
        probability: row.opportunity.probability,
        expectedCloseDate: row.opportunity.expectedCloseDate,
        nextAction: row.opportunity.nextAction,
        nextActionDueAt: row.opportunity.nextActionDueAt,
        riskLevel: row.opportunity.riskLevel,
        lastFollowUpAt: row.opportunity.lastFollowUpAt,
        createdAt: row.opportunity.createdAt,
        updatedAt: row.opportunity.updatedAt,
      };
      if (!isActiveStage(row.opportunity.stage)) {
        return { ...base, priority: null, score: null, reasons: [], suggestedAction: null };
      }
      const scored = scoreOpportunity(toPriorityInput(db, row, now), now);
      return {
        ...base,
        priority: scored.priority,
        score: scored.score,
        reasons: scored.reasons,
        suggestedAction: scored.suggestedAction,
      };
    });
}
```

注意：`buildSuggestAction` 在 priority.ts 中已经使用传入的 `now`；不要在 workspace 里重复实现。

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm --filter @salespilot/server exec vitest run src/domain/workspace.test.ts`
Expected: PASS。若 `buildCustomerAssessment` 的 `suggestion` 不含“备货”，检查华辰商机的库存信号是否命中 SRV 缺口。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/domain/workspace.ts apps/server/src/domain/workspace.test.ts
git commit -m "feat: add scoped workspace aggregation service"
```

---

# Phase 2：业务 API

## Task 6：跟进与商机写服务

**Files:**
- Create: `apps/server/src/domain/followUps.ts`
- Test: `apps/server/src/domain/followUps.test.ts`

- [ ] **Step 1：写失败测试**

创建 `apps/server/src/domain/followUps.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Actor } from "@salespilot/shared";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { followUps, opportunities } from "../db/schema.js";
import { recordFollowUp, updateOpportunity } from "./followUps.js";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return { db, sqlite, actor: sales };
}

describe("follow-up domain", () => {
  it("records a follow-up and moves the opportunity next action", () => {
    const { db, actor } = setup();
    const result = recordFollowUp(db, actor, {
      customerId: "c_huachen",
      opportunityId: "o_huachen_server",
      type: "call",
      content: "已联系采购，预算本周确认",
      result: "客户确认本周五给答复",
      nextAction: "周五再次联系采购",
      nextActionDueAt: Date.now() + 3 * 86_400_000,
    });
    expect(result.followUp.id).toBeTruthy();
    const row = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
    expect(row?.nextAction).toBe("周五再次联系采购");
    expect(row?.lastFollowUpAt).toBeGreaterThan(0);
  });

  it("rejects a follow-up for another sales rep's customer", () => {
    const { db, actor } = setup();
    expect(() =>
      recordFollowUp(db, actor, {
        customerId: "c_zhihang",
        type: "call",
        content: "越权跟进",
      }),
    ).toThrow();
  });

  it("updates opportunity stage and next action", () => {
    const { db, actor } = setup();
    updateOpportunity(db, actor, "o_huachen_server", {
      stage: "negotiation",
      probability: 80,
      nextAction: "确认合同条款",
    });
    const row = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
    expect(row?.stage).toBe("negotiation");
    expect(row?.probability).toBe(80);
  });

  it("allows a manager to update a team opportunity", () => {
    const { db } = setup();
    const manager: Actor = { id: "u_manager_wang", name: "老王", role: "manager", teamId: "team_east" };
    updateOpportunity(db, manager, "o_zhihang_server", { riskLevel: "medium" });
    const row = db.select().from(opportunities).where(eq(opportunities.id, "o_zhihang_server")).get();
    expect(row?.riskLevel).toBe("medium");
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/domain/followUps.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3：实现 followUps.ts**

创建 `apps/server/src/domain/followUps.ts`：

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { AppError, type Actor, type FollowUpType, type OpportunityStage, type RiskLevel } from "@salespilot/shared";
import type { Db } from "../db/client.js";
import { customers, followUps, opportunities } from "../db/schema.js";
import { scopedOwnerIds } from "../lib/actor.js";

export interface RecordFollowUpInput {
  customerId: string;
  opportunityId?: string;
  type: FollowUpType;
  content: string;
  result?: string;
  nextAction?: string;
  nextActionDueAt?: number;
}

export interface UpdateOpportunityInput {
  stage?: OpportunityStage;
  probability?: number;
  riskLevel?: RiskLevel;
  nextAction?: string | null;
  nextActionDueAt?: number | null;
  amountCents?: number;
  expectedCloseDate?: number;
}

function assertOpportunityAccess(db: Db, actor: Actor, opportunityId: string, customerId: string) {
  const opportunity = db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).get();
  if (!opportunity) throw new AppError("NOT_FOUND", "商机不存在");
  if (opportunity.customerId !== customerId) throw new AppError("VALIDATION_ERROR", "商机不属于该客户");
  if (!scopedOwnerIds(db, actor).includes(opportunity.ownerId)) throw new AppError("FORBIDDEN", "无权操作该商机");
  return opportunity;
}

export function recordFollowUp(db: Db, actor: Actor, input: RecordFollowUpInput) {
  const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
  if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
  if (!scopedOwnerIds(db, actor).includes(customer.ownerId)) throw new AppError("FORBIDDEN", "无权操作该客户");
  if (input.opportunityId) assertOpportunityAccess(db, actor, input.opportunityId, input.customerId);
  const now = Date.now();
  const id = `f_${randomUUID()}`;
  db.transaction((tx) => {
    tx.insert(followUps)
      .values({
        id,
        customerId: input.customerId,
        opportunityId: input.opportunityId ?? null,
        actorId: actor.id,
        type: input.type,
        content: input.content,
        result: input.result ?? null,
        nextAction: input.nextAction ?? null,
        nextActionDueAt: input.nextActionDueAt ?? null,
        createdAt: now,
      })
      .run();
    if (input.opportunityId) {
      tx.update(opportunities)
        .set({
          lastFollowUpAt: now,
          nextAction: input.nextAction ?? undefined,
          nextActionDueAt: input.nextActionDueAt ?? undefined,
          updatedAt: now,
        })
        .where(eq(opportunities.id, input.opportunityId))
        .run();
    }
  });
  return { followUp: { id, ...input, actorId: actor.id, createdAt: now } };
}

export function updateOpportunity(db: Db, actor: Actor, opportunityId: string, patch: UpdateOpportunityInput) {
  const opportunity = db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).get();
  if (!opportunity) throw new AppError("NOT_FOUND", "商机不存在");
  if (!scopedOwnerIds(db, actor).includes(opportunity.ownerId)) throw new AppError("FORBIDDEN", "无权操作该商机");
  if (patch.probability !== undefined && (patch.probability < 0 || patch.probability > 100)) {
    throw new AppError("VALIDATION_ERROR", "成交概率必须在 0–100 之间");
  }
  const now = Date.now();
  db.update(opportunities)
    .set({
      stage: patch.stage ?? undefined,
      probability: patch.probability ?? undefined,
      riskLevel: patch.riskLevel ?? undefined,
      nextAction: patch.nextAction === undefined ? undefined : patch.nextAction,
      nextActionDueAt: patch.nextActionDueAt === undefined ? undefined : patch.nextActionDueAt,
      amountCents: patch.amountCents ?? undefined,
      expectedCloseDate: patch.expectedCloseDate ?? undefined,
      updatedAt: now,
    })
    .where(eq(opportunities.id, opportunityId))
    .run();
  return db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).get()!;
}
```

注意：Drizzle 的 `.set()` 中 `undefined` 表示不更新；`null` 表示清空。上面 `nextAction: patch.nextAction === undefined ? undefined : patch.nextAction` 保留了清空语义。

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm --filter @salespilot/server exec vitest run src/domain/followUps.test.ts`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/domain/followUps.ts apps/server/src/domain/followUps.test.ts
git commit -m "feat: add follow-up and opportunity write services"
```

---

## Task 7：作战室、商机、跟进路由

**Files:**
- Create: `apps/server/src/routes/workspace.ts`
- Create: `apps/server/src/routes/followUps.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/src/routes/workspace.test.ts`
- Test: `apps/server/src/routes/followUps.test.ts`

- [ ] **Step 1：写失败测试**

创建 `apps/server/src/routes/workspace.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { buildApp } from "../app.js";
import { MockProvider } from "../agent/mockProvider.js";

const as = (id: string) => ({ "x-actor-id": id });

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return buildApp({ db, sqlite, provider: new MockProvider() });
}

describe("workspace routes", () => {
  it("returns the sales war room", async () => {
    const app = setup();
    const response = await app.inject({ method: "GET", url: "/api/business/workspace", headers: as("u_sales_lin") });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.scope).toBe("self");
    expect(body.priorities[0].customerName).toBe("华辰设计");
    expect(body.metrics.monthSalesCents).toBeGreaterThan(0);
    expect(body.todos).toBeTruthy();
  });

  it("returns team metrics and ranking for managers", async () => {
    const app = setup();
    const response = await app.inject({ method: "GET", url: "/api/business/workspace", headers: as("u_manager_wang") });
    const body = response.json();
    expect(body.scope).toBe("team");
    expect(body.ranking.length).toBeGreaterThanOrEqual(3);
  });

  it("lists and updates opportunities with scope checks", async () => {
    const app = setup();
    const list = await app.inject({ method: "GET", url: "/api/business/opportunities", headers: as("u_sales_lin") });
    expect(list.statusCode).toBe(200);
    expect(list.json().opportunities.some((row: { id: string }) => row.id === "o_huachen_server")).toBe(true);
    expect(list.json().opportunities.some((row: { id: string }) => row.id === "o_zhihang_server")).toBe(false);

    const forbidden = await app.inject({ method: "PATCH", url: "/api/business/opportunities/o_zhihang_server", headers: as("u_sales_lin"), payload: { nextAction: "越权" } });
    expect(forbidden.statusCode).toBe(403);

    const updated = await app.inject({
      method: "PATCH",
      url: "/api/business/opportunities/o_huachen_server",
      headers: as("u_sales_lin"),
      payload: { nextAction: "周五确认预算", probability: 75 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().opportunity.nextAction).toBe("周五确认预算");
  });
});
```

创建 `apps/server/src/routes/followUps.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { buildApp } from "../app.js";
import { MockProvider } from "../agent/mockProvider.js";
import { opportunities } from "../db/schema.js";

const as = (id: string) => ({ "x-actor-id": id });

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return { app: buildApp({ db, sqlite, provider: new MockProvider() }), db };
}

describe("follow-up routes", () => {
  it("records a follow-up and updates the opportunity", async () => {
    const { app, db } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/business/follow-ups",
      headers: as("u_sales_lin"),
      payload: {
        customerId: "c_huachen",
        opportunityId: "o_huachen_server",
        type: "call",
        content: "已联系采购，预算本周确认",
        result: "客户周五答复",
        nextAction: "周五再次联系采购",
        nextActionDueAt: Date.now() + 3 * 86_400_000,
      },
    });
    expect(response.statusCode).toBe(200);
    const row = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
    expect(row?.nextAction).toBe("周五再次联系采购");
  });

  it("rejects cross-owner follow-ups", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/business/follow-ups",
      headers: as("u_sales_lin"),
      payload: { customerId: "c_zhihang", type: "call", content: "越权" },
    });
    expect(response.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/routes/workspace.test.ts src/routes/followUps.test.ts`
Expected: FAIL，路由 404。

- [ ] **Step 3：实现 workspace 路由**

创建 `apps/server/src/routes/workspace.ts`：

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError, opportunityStage, riskLevel, type OpportunityStage, type RiskLevel } from "@salespilot/shared";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { resolveActor } from "../lib/actor.js";
import { buildOpportunityDetail, buildWorkspace, listOpportunityViews } from "../domain/workspace.js";
import { updateOpportunity } from "../domain/followUps.js";
import { executeTool, toolMap } from "../tools/index.js";

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
};

const PATCH = z.object({
  stage: opportunityStage.optional(),
  probability: z.number().int().min(0).max(100).optional(),
  riskLevel: riskLevel.optional(),
  nextAction: z.string().max(200).nullable().optional(),
  nextActionDueAt: z.number().int().nonnegative().nullable().optional(),
  amountCents: z.number().int().nonnegative().optional(),
  expectedCloseDate: z.number().int().nonnegative().optional(),
});

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.code(ERROR_STATUS[error.code] ?? 400).send({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details, suggestedAction: error.suggestedAction },
    });
  }
  return reply.code(500).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "服务器内部错误" } });
}

function handle(fn: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> | unknown) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(request, reply);
    } catch (error) {
      return sendError(reply, error);
    }
  };
}

export function registerWorkspace(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  const actorOf = (request: FastifyRequest) => resolveActor(deps.db, request);

  app.after(() => {
    app.get(
      "/api/business/workspace",
      { schema: { tags: ["workspace"], summary: "Sales war room: metrics, priorities, todos and risks" } },
      handle(async (request) => {
        const actor = actorOf(request);
        const workspace = buildWorkspace(deps.db, actor);
        const briefing = await executeTool(toolMap.get("get_sales_briefing")!, { db: deps.db, sqlite: deps.sqlite, actor, traceId: "workspace", emit: () => {} }, {
          scope: actor.role === "manager" ? "team" : "self",
        });
        const alerts = briefing.model.ok ? ((briefing.model.data as { alerts: unknown[] }).alerts ?? []) : [];
        return { ok: true, ...workspace, alerts };
      }),
    );

    app.get(
      "/api/business/opportunities",
      {
        schema: {
          tags: ["workspace"],
          summary: "List opportunities visible to the current actor",
          querystring: {
            type: "object",
            properties: {
              stage: { type: "string" },
              risk: { type: "string" },
              customerId: { type: "string" },
              ownerId: { type: "string" },
            },
          },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const query = request.query as { stage?: string; risk?: string; customerId?: string; ownerId?: string };
        const stageParsed = query.stage ? opportunityStage.safeParse(query.stage) : null;
        const riskParsed = query.risk ? riskLevel.safeParse(query.risk) : null;
        if (stageParsed && !stageParsed.success) throw new AppError("VALIDATION_ERROR", "无效的商机阶段");
        if (riskParsed && !riskParsed.success) throw new AppError("VALIDATION_ERROR", "无效的风险等级");
        const stage = stageParsed?.success ? (stageParsed.data as OpportunityStage) : undefined;
        const risk = riskParsed?.success ? (riskParsed.data as RiskLevel) : undefined;
        return {
          ok: true,
          opportunities: listOpportunityViews(deps.db, actor, { stage, risk, customerId: query.customerId, ownerId: query.ownerId }),
        };
      }),
    );

    app.get(
      "/api/business/opportunities/:id",
      { schema: { tags: ["workspace"], summary: "Opportunity detail with customer, quotes, orders and follow-ups" } },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        return { ok: true, ...buildOpportunityDetail(deps.db, actor, id) };
      }),
    );

    app.patch(
      "/api/business/opportunities/:id",
      { attachValidation: true, schema: { tags: ["workspace"], summary: "Update an opportunity's next action or stage" } },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const parsed = PATCH.safeParse(request.body);
        if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请求参数不合法", parsed.error.issues);
        return { ok: true, opportunity: updateOpportunity(deps.db, actor, id, parsed.data) };
      }),
    );
  });
}
```

- [ ] **Step 4：实现 follow-up 路由**

创建 `apps/server/src/routes/followUps.ts`：

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError, followUpType } from "@salespilot/shared";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";
import { resolveActor } from "../lib/actor.js";
import { recordFollowUp } from "../domain/followUps.js";

const CREATE = z.object({
  customerId: z.string().min(1),
  opportunityId: z.string().min(1).optional(),
  type: followUpType.exclude(["ai_suggestion"]),
  content: z.string().min(2).max(1000),
  result: z.string().max(500).optional(),
  nextAction: z.string().max(200).optional(),
  nextActionDueAt: z.number().int().nonnegative().optional(),
});

const ERROR_STATUS: Record<string, number> = { VALIDATION_ERROR: 400, NOT_FOUND: 404, FORBIDDEN: 403 };

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.code(ERROR_STATUS[error.code] ?? 400).send({ ok: false, error: { code: error.code, message: error.message } });
  }
  return reply.code(500).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "服务器内部错误" } });
}

export function registerFollowUps(app: FastifyInstance, deps: { db: Db }) {
  app.after(() => {
    app.post(
      "/api/business/follow-ups",
      { attachValidation: true, schema: { tags: ["workspace"], summary: "Record a follow-up and update the opportunity" } },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const actor = resolveActor(deps.db, request);
          const parsed = CREATE.safeParse(request.body);
          if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请求参数不合法", parsed.error.issues);
          return { ok: true, ...recordFollowUp(deps.db, actor, parsed.data) };
        } catch (error) {
          return sendError(reply, error);
        }
      },
    );
  });
}
```

注意：`followUpType.exclude` 在 Zod 3 中可用；如果类型报错，改为：

```ts
type: z.enum(["call", "wechat", "email", "meeting", "quote", "system"]),
```

- [ ] **Step 5：注册路由**

在 `apps/server/src/app.ts` 导入并注册：

```ts
import { registerWorkspace } from "./routes/workspace.js";
import { registerFollowUps } from "./routes/followUps.js";
```

在 `registerBusiness` 之后：

```ts
registerWorkspace(app, deps);
registerFollowUps(app, deps);
```

- [ ] **Step 6：运行测试确认通过**

Run: `pnpm --filter @salespilot/server exec vitest run src/routes/workspace.test.ts src/routes/followUps.test.ts`
Expected: PASS。

- [ ] **Step 7：提交**

```bash
git add apps/server/src/routes/workspace.ts apps/server/src/routes/followUps.ts apps/server/src/routes/workspace.test.ts apps/server/src/routes/followUps.test.ts apps/server/src/app.ts
git commit -m "feat: add workspace and follow-up APIs"
```

---

## Task 8：客户详情扩展与报价/订单商机关联

**Files:**
- Modify: `packages/shared/src/schemas.ts`（已在 Task 1 加 `opportunityId`）
- Modify: `apps/server/src/routes/business.ts`
- Modify: `apps/server/src/tools/write/createQuote.ts`
- Modify: `apps/server/src/domain/orders.ts`
- Test: `apps/server/src/routes/business.test.ts`
- Test: `apps/server/src/tools/write-tools.test.ts`

- [ ] **Step 1：写失败测试**

在 `apps/server/src/routes/business.test.ts` 追加：

```ts
it("returns opportunities, follow-ups and assessment in customer detail", async () => {
  const { app } = setup();
  const response = await app.inject({ method: "GET", url: "/api/business/customers/c_huachen", headers: as("u_sales_lin") });
  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.opportunities.some((row: { id: string }) => row.id === "o_huachen_server")).toBe(true);
  expect(body.followUps.length).toBeGreaterThan(0);
  expect(body.assessment.suggestion).toBeTruthy();
});
```

在 `apps/server/src/tools/write-tools.test.ts` 追加：

```ts
it("links a created quote and order to an opportunity", async () => {
  const { ctx, events, db } = setup();
  const preview = await executeTool(tool("create_quote"), ctx, {
    customerId: "c_huachen",
    contactId: "ct_zhang_1",
    opportunityId: "o_huachen_server",
    lines: [{ sku: "SRV", quantity: 2 }],
    dryRun: true,
  });
  expect(preview.model.ok).toBe(true);
  const token = events.find((event) => event.type === "artifact").payload.confirmationToken;
  const committed = await executeTool(tool("create_quote"), ctx, {
    customerId: "c_huachen",
    contactId: "ct_zhang_1",
    opportunityId: "o_huachen_server",
    lines: [{ sku: "SRV", quantity: 2 }],
    dryRun: false,
    confirmationToken: token,
    idempotencyKey: "idem-opportunity-quote",
  });
  expect(committed.model.ok).toBe(true);
  const quote = db.select().from(quotes).where(eq(quotes.id, (committed.model as any).data.quote.id)).get();
  expect(quote?.opportunityId).toBe("o_huachen_server");

  const orderPreview = await executeTool(tool("convert_quote_to_order"), ctx, { quoteId: quote!.id, dryRun: true });
  expect(orderPreview.model.ok).toBe(true);
  const orderToken = events.filter((event) => event.type === "artifact").at(-1).payload.confirmationToken;
  const orderCommitted = await executeTool(tool("convert_quote_to_order"), ctx, {
    quoteId: quote!.id,
    dryRun: false,
    confirmationToken: orderToken,
    idempotencyKey: "idem-opportunity-order",
  });
  expect(orderCommitted.model.ok).toBe(true);
  const order = db.select().from(orders).where(eq(orders.quoteId, quote!.id)).get();
  expect(order?.opportunityId).toBe("o_huachen_server");
  const opportunity = db.select().from(opportunities).where(eq(opportunities.id, "o_huachen_server")).get();
  expect(opportunity?.stage).toBe("won");
});
```

同时在 `apps/server/src/tools/write-tools.test.ts` 顶部把 schema 导入改为：

```ts
import { approvals, customers, opportunities, orders, priceRules, quotes } from "../db/schema.js";
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/routes/business.test.ts src/tools/write-tools.test.ts`
Expected: FAIL，客户详情没有 `opportunities`，报价没有写入 `opportunityId`。

- [ ] **Step 3：扩展客户详情**

在 `apps/server/src/routes/business.ts` 顶部导入：

```ts
import { buildCustomerAssessment, listOpportunityViews } from "../domain/workspace.js";
import { followUps as followUpTable } from "../db/schema.js";
```

在 `/api/business/customers/:id` 返回对象中追加：

```ts
opportunities: listOpportunityViews(deps.db, actor, { customerId: id }),
followUps: deps.db
  .select()
  .from(followUpTable)
  .where(eq(followUpTable.customerId, id))
  .orderBy(desc(followUpTable.createdAt))
  .limit(20)
  .all(),
assessment: buildCustomerAssessment(deps.db, actor, id),
```

注意：`listOpportunityViews` 已经做了数据范围校验（它用 `scopedOwnerIds`），`buildCustomerAssessment` 也会校验客户归属。

- [ ] **Step 4：让报价支持 opportunityId**

在 `apps/server/src/routes/business.ts` 的 `QUOTE_PREVIEW` 对象加：

```ts
opportunityId: z.string().min(1).optional(),
```

在 `/api/business/quotes/preview` 调用 `create_quote` 的入参中加：

```ts
opportunityId: input.opportunityId,
```

在 `/api/business/quotes/commit` 中，`input.payload` 已包含 `opportunityId`，无需额外处理。

在 `apps/server/src/tools/write/createQuote.ts`：

1. `businessPayload` 增加 `opportunityId: input.opportunityId`。
2. 在客户校验之后加：

```ts
if (input.opportunityId) {
  const opportunity = ctx.db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).get();
  if (!opportunity || opportunity.customerId !== customer.id) {
    return { model: fail("NOT_FOUND", "商机不存在或不属于该客户") };
  }
}
```

3. 在 `quotes` 插入对象中加：

```ts
opportunityId: input.opportunityId ?? null,
```

4. 在报价写入成功后、返回前加：

```ts
if (input.opportunityId) {
  ctx.db
    .update(opportunities)
    .set({ stage: "quote", updatedAt: now })
    .where(eq(opportunities.id, input.opportunityId))
    .run();
}
```

需要导入：

```ts
import { contacts, customers, opportunities, priceRules, products, quoteLines, quotes } from "../../db/schema.js";
```

- [ ] **Step 5：让订单继承商机并推进阶段**

在 `apps/server/src/domain/orders.ts`：

1. 在 `orders` 插入对象中加：

```ts
opportunityId: quote.opportunityId,
```

2. 在 `quotes` 状态更新之后加：

```ts
if (quote.opportunityId) {
  ctx.db
    .update(opportunities)
    .set({
      stage: "won",
      probability: 100,
      nextAction: null,
      nextActionDueAt: null,
      updatedAt: Date.now(),
    })
    .where(eq(opportunities.id, quote.opportunityId))
    .run();
}
```

3. 导入 `opportunities`。

- [ ] **Step 6：运行测试确认通过**

Run: `pnpm --filter @salespilot/server exec vitest run src/routes/business.test.ts src/tools/write-tools.test.ts`
Expected: PASS。

注意：现有 `business.test.ts` 中 `metrics.customers` 对销售的断言需要从 8 改为 9（因为新增了 `c_hengtai` 归小林）。同时 `seed.test.ts` 已在 Task 3 更新。

- [ ] **Step 7：提交**

```bash
git add apps/server/src/routes/business.ts apps/server/src/tools/write/createQuote.ts apps/server/src/domain/orders.ts apps/server/src/routes/business.test.ts apps/server/src/tools/write-tools.test.ts
git commit -m "feat: link quotes and orders to opportunities"
```

---

# Phase 3：AI 主动工具链

## Task 9：新增读工具

**Files:**
- Create: `apps/server/src/tools/read/getSalesPriorities.ts`
- Create: `apps/server/src/tools/read/getOpportunityDetail.ts`
- Modify: `apps/server/src/tools/read/getCustomer360.ts`
- Modify: `apps/server/src/tools/index.ts`
- Test: `apps/server/src/tools/proactive-tools.test.ts`

- [ ] **Step 1：写失败测试**

创建 `apps/server/src/tools/proactive-tools.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import type { Actor } from "@salespilot/shared";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { allTools, executeTool } from "./index.js";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };
const manager: Actor = { id: "u_manager_wang", name: "老王", role: "manager", teamId: "team_east" };

function ctx(actor: Actor) {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  return { db, sqlite, actor, traceId: "t_proactive", emit: () => {} };
}

const tool = (name: string) => allTools.find((item) => item.name === name)!;

describe("proactive read tools", () => {
  it("returns priorities for the sales rep", async () => {
    const result = await executeTool(tool("get_sales_priorities"), ctx(sales), { scope: "self" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) {
      const data = result.model.data as any;
      expect(data.priorities[0].customerName).toBe("华辰设计");
      expect(data.metrics.activeOpportunities).toBeGreaterThan(0);
    }
  });

  it("blocks team scope for sales", async () => {
    const result = await executeTool(tool("get_sales_priorities"), ctx(sales), { scope: "team" });
    expect(result.model.ok).toBe(false);
    if (!result.model.ok) expect(result.model.error.code).toBe("FORBIDDEN");
  });

  it("returns opportunity detail", async () => {
    const result = await executeTool(tool("get_opportunity_detail"), ctx(sales), { opportunityId: "o_huachen_server" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) {
      const data = result.model.data as any;
      expect(data.opportunity.id).toBe("o_huachen_server");
      expect(data.followUps.length).toBeGreaterThan(0);
    }
  });

  it("includes opportunities in customer 360", async () => {
    const result = await executeTool(tool("get_customer_360"), ctx(sales), { customerId: "c_huachen" });
    expect(result.model.ok).toBe(true);
    if (result.model.ok) {
      const data = result.model.data as any;
      expect(data.opportunities.length).toBeGreaterThan(0);
      expect(data.followUps.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/tools/proactive-tools.test.ts`
Expected: FAIL，工具不存在。

- [ ] **Step 3：实现 getSalesPriorities**

创建 `apps/server/src/tools/read/getSalesPriorities.ts`：

```ts
import { GetSalesPrioritiesInput, fail, ok } from "@salespilot/shared";
import { buildWorkspace } from "../../domain/workspace.js";
import type { ToolDefinition } from "../types.js";

export const getSalesPriorities: ToolDefinition<GetSalesPrioritiesInput, unknown> = {
  name: "get_sales_priorities",
  description: "获取今日销售优先级、关键指标和待办。销售只能看自己；经理可看团队。",
  inputSchema: GetSalesPrioritiesInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    if (input.scope === "team" && ctx.actor.role !== "manager") {
      return { model: fail("FORBIDDEN", "销售只能查看自己的优先级") };
    }
    const workspace = buildWorkspace(ctx.db, ctx.actor, { scope: input.scope });
    const items =
      input.focus === "risk"
        ? workspace.risks
        : input.focus === "follow_up"
          ? workspace.priorities.filter((item) => item.signals.overdueDays > 0 || item.signals.idleDays >= 3)
          : workspace.priorities;
    return {
      model: ok({
        scope: input.scope,
        headline: workspace.headline,
        metrics: workspace.metrics,
        priorities: items.slice(0, input.limit),
        todos: workspace.todos,
        ranking: workspace.ranking,
      }),
    };
  },
};
```

- [ ] **Step 4：实现 getOpportunityDetail**

创建 `apps/server/src/tools/read/getOpportunityDetail.ts`：

```ts
import { AppError, GetOpportunityDetailInput, fail, ok } from "@salespilot/shared";
import { buildOpportunityDetail } from "../../domain/workspace.js";
import type { ToolDefinition } from "../types.js";

export const getOpportunityDetail: ToolDefinition<GetOpportunityDetailInput, unknown> = {
  name: "get_opportunity_detail",
  description: "读取单个商机的完整上下文：客户、关联报价/订单、最近跟进、风险信号和建议下一步。",
  inputSchema: GetOpportunityDetailInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    try {
      return { model: ok(buildOpportunityDetail(ctx.db, ctx.actor, input.opportunityId)) };
    } catch (error) {
      if (error instanceof AppError) {
        return { model: fail(error.code, error.message, { details: error.details, suggestedAction: error.suggestedAction }) };
      }
      return { model: fail("PROVIDER_ERROR", "读取商机失败") };
    }
  },
};
```

- [ ] **Step 5：扩展 customer 360**

在 `apps/server/src/tools/read/getCustomer360.ts`：

1. 把顶部导入改为：

```ts
import { desc, eq } from "drizzle-orm";
import { GetCustomer360Input, fail, ok } from "@salespilot/shared";
import { contacts, customers, followUps, opportunities, orders, quotes } from "../../db/schema.js";
import { scopedOwnerIds } from "../../lib/actor.js";
import type { ToolDefinition } from "../types.js";
```

同时把 `assertCustomerAccess(ctx.actor, customer);` 替换为：

```ts
if (!scopedOwnerIds(ctx.db, ctx.actor).includes(customer.ownerId)) {
  return { model: fail("FORBIDDEN", "无权访问该客户") };
}
```
2. 在 `recentOrders` 之后加：

```ts
const opportunityRows = ctx.db
  .select()
  .from(opportunities)
  .where(eq(opportunities.customerId, customer.id))
  .all();
const followUpRows = ctx.db
  .select()
  .from(followUps)
  .where(eq(followUps.customerId, customer.id))
  .orderBy(desc(followUps.createdAt))
  .limit(20)
  .all();
```

3. 在返回的 `ok({...})` 中加：

```ts
opportunities: opportunityRows,
followUps: followUpRows,
```

4. 同时收紧 `apps/server/src/tools/read/searchCustomers.ts` 的数据范围：

```ts
import { scopedOwnerIds } from "../../lib/actor.js";

const scope = inArray(customers.ownerId, scopedOwnerIds(ctx.db, ctx.actor));
```

原来的 `ctx.actor.role === "sales" ? eq(...) : undefined` 会让经理搜索到其他团队客户；改为统一使用作用域列表，销售仍只看自己，经理只看本团队。

- [ ] **Step 6：注册工具**

在 `apps/server/src/tools/index.ts`：

```ts
import { getSalesPriorities } from "./read/getSalesPriorities.js";
import { getOpportunityDetail } from "./read/getOpportunityDetail.js";

export const readTools = [
  searchCustomers,
  getCustomer360,
  checkInventory,
  getPricing,
  searchKnowledge,
  getSalesBriefing,
  getSalesPriorities,
  getOpportunityDetail,
] as ToolDefinition<any, any>[];
```

- [ ] **Step 7：运行测试确认通过**

Run: `pnpm --filter @salespilot/server exec vitest run src/tools/proactive-tools.test.ts src/tools/read-tools.test.ts`
Expected: PASS。

- [ ] **Step 8：提交**

```bash
git add apps/server/src/tools/read/getSalesPriorities.ts apps/server/src/tools/read/getOpportunityDetail.ts apps/server/src/tools/read/getCustomer360.ts apps/server/src/tools/index.ts apps/server/src/tools/proactive-tools.test.ts
git commit -m "feat: add proactive sales read tools"
```

---

## Task 10：新增写工具

**Files:**
- Create: `apps/server/src/tools/write/logFollowUp.ts`
- Create: `apps/server/src/tools/write/updateOpportunityNextAction.ts`
- Modify: `apps/server/src/tools/index.ts`
- Test: `apps/server/src/tools/proactive-tools.test.ts`

- [ ] **Step 1：写失败测试**

在 `apps/server/src/tools/proactive-tools.test.ts` 追加：

```ts
it("previews and commits a follow-up with confirmation", async () => {
  const c = ctx(sales);
  const events: any[] = [];
  const toolCtx = { ...c, emit: (event: any) => events.push(event) };
  const preview = await executeTool(tool("log_follow_up"), toolCtx, {
    customerId: "c_huachen",
    opportunityId: "o_huachen_server",
    type: "call",
    content: "已联系采购，预算本周确认",
    result: "客户周五答复",
    nextAction: "周五再次联系采购",
    nextActionDueAt: Date.now() + 3 * 86_400_000,
    dryRun: true,
  });
  expect(preview.model.ok).toBe(true);
  if (preview.model.ok) expect((preview.model.data as any).status).toBe("pending_confirmation");
  const artifact = events.find((event) => event.type === "artifact");
  expect(artifact.payload.kind).toBe("follow_up");
  const committed = await executeTool(tool("log_follow_up"), toolCtx, {
    customerId: "c_huachen",
    opportunityId: "o_huachen_server",
    type: "call",
    content: "已联系采购，预算本周确认",
    result: "客户周五答复",
    nextAction: "周五再次联系采购",
    nextActionDueAt: Date.now() + 3 * 86_400_000,
    dryRun: false,
    confirmationToken: artifact.payload.confirmationToken,
    idempotencyKey: "idem-follow-up-1",
  });
  expect(committed.model.ok).toBe(true);
  if (committed.model.ok) expect((committed.model.data as any).status).toBe("committed");
});

it("previews and commits a next-action update", async () => {
  const c = ctx(sales);
  const events: any[] = [];
  const toolCtx = { ...c, emit: (event: any) => events.push(event) };
  const preview = await executeTool(tool("update_opportunity_next_action"), toolCtx, {
    opportunityId: "o_huachen_server",
    nextAction: "周五确认预算",
    nextActionDueAt: Date.now() + 2 * 86_400_000,
    dryRun: true,
  });
  expect(preview.model.ok).toBe(true);
  const artifact = events.find((event) => event.type === "artifact");
  expect(artifact.payload.kind).toBe("next_action");
  const committed = await executeTool(tool("update_opportunity_next_action"), toolCtx, {
    opportunityId: "o_huachen_server",
    nextAction: "周五确认预算",
    nextActionDueAt: Date.now() + 2 * 86_400_000,
    dryRun: false,
    confirmationToken: artifact.payload.confirmationToken,
    idempotencyKey: "idem-next-action-1",
  });
  expect(committed.model.ok).toBe(true);
  if (committed.model.ok) expect((committed.model.data as any).status).toBe("committed");
});

it("blocks cross-owner writes", async () => {
  const result = await executeTool(tool("update_opportunity_next_action"), ctx(sales), {
    opportunityId: "o_zhihang_server",
    nextAction: "越权",
    dryRun: true,
  });
  expect(result.model.ok).toBe(false);
  if (!result.model.ok) expect(result.model.error.code).toBe("FORBIDDEN");
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/tools/proactive-tools.test.ts`
Expected: FAIL，工具不存在。

- [ ] **Step 3：实现 logFollowUp**

创建 `apps/server/src/tools/write/logFollowUp.ts`：

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { LogFollowUpInput, fail, ok } from "@salespilot/shared";
import { customers, followUps, opportunities } from "../../db/schema.js";
import { consumeConfirmationToken, issueConfirmationToken } from "../../domain/confirmation.js";
import { withIdempotency } from "../../domain/idempotency.js";
import { scopedOwnerIds } from "../../lib/actor.js";
import type { ToolDefinition } from "../types.js";

const businessPayload = (input: LogFollowUpInput) => ({
  customerId: input.customerId,
  opportunityId: input.opportunityId,
  type: input.type,
  content: input.content,
  result: input.result,
  nextAction: input.nextAction,
  nextActionDueAt: input.nextActionDueAt,
});

export const logFollowUp: ToolDefinition<LogFollowUpInput, unknown> = {
  name: "log_follow_up",
  description: "记录一次客户跟进，并同步商机的下一步与截止时间。必须先 dry-run 预览，用户确认后提交。",
  inputSchema: LogFollowUpInput,
  kind: "write",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const customer = ctx.db.select().from(customers).where(eq(customers.id, input.customerId)).get();
    if (!customer) return { model: fail("NOT_FOUND", "客户不存在") };
    if (!scopedOwnerIds(ctx.db, ctx.actor).includes(customer.ownerId)) {
      return { model: fail("FORBIDDEN", "无权操作该客户") };
    }
    if (input.opportunityId) {
      const opportunity = ctx.db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).get();
      if (!opportunity || opportunity.customerId !== customer.id) {
        return { model: fail("NOT_FOUND", "商机不存在或不属于该客户") };
      }
      if (!scopedOwnerIds(ctx.db, ctx.actor).includes(opportunity.ownerId)) {
        return { model: fail("FORBIDDEN", "无权操作该商机") };
      }
    }

    if (input.dryRun) {
      const { token, expiresAt } = issueConfirmationToken(ctx.db, {
        actorId: ctx.actor.id,
        toolName: "log_follow_up",
        payload: businessPayload(input),
      });
      return {
        model: ok({
          status: "pending_confirmation",
          preview: {
            customer: { id: customer.id, name: customer.name },
            opportunityId: input.opportunityId,
            type: input.type,
            content: input.content,
            result: input.result,
            nextAction: input.nextAction,
            nextActionDueAt: input.nextActionDueAt,
          },
          expiresAt,
        }),
        artifacts: [
          {
            kind: "follow_up",
            toolName: "log_follow_up",
            title: "跟进记录预览",
            payload: { preview: businessPayload(input), input: businessPayload(input) },
            confirmationToken: token,
          },
        ],
      };
    }

    const result = withIdempotency(
      ctx.db,
      { key: input.idempotencyKey!, actorId: ctx.actor.id, toolName: "log_follow_up", request: businessPayload(input) },
      () => {
        consumeConfirmationToken(ctx.db, input.confirmationToken!, {
          actorId: ctx.actor.id,
          toolName: "log_follow_up",
          payload: businessPayload(input),
        });
        const now = Date.now();
        const id = `f_${randomUUID()}`;
        ctx.db.insert(followUps).values({
          id,
          customerId: input.customerId,
          opportunityId: input.opportunityId ?? null,
          actorId: ctx.actor.id,
          type: input.type,
          content: input.content,
          result: input.result ?? null,
          nextAction: input.nextAction ?? null,
          nextActionDueAt: input.nextActionDueAt ?? null,
          createdAt: now,
        }).run();
        if (input.opportunityId) {
          ctx.db.update(opportunities).set({
            lastFollowUpAt: now,
            nextAction: input.nextAction ?? undefined,
            nextActionDueAt: input.nextActionDueAt ?? undefined,
            updatedAt: now,
          }).where(eq(opportunities.id, input.opportunityId)).run();
        }
        return { followUp: { id, customerId: input.customerId, opportunityId: input.opportunityId ?? null, type: input.type, content: input.content, result: input.result ?? null, nextAction: input.nextAction ?? null, nextActionDueAt: input.nextActionDueAt ?? null, createdAt: now } };
      },
    );
    return { model: ok({ status: "committed", followUp: result.value.followUp, replayed: result.replayed }) };
  },
};
```

- [ ] **Step 4：实现 updateOpportunityNextAction**

创建 `apps/server/src/tools/write/updateOpportunityNextAction.ts`：

```ts
import { eq } from "drizzle-orm";
import { UpdateOpportunityNextActionInput, fail, ok } from "@salespilot/shared";
import { opportunities } from "../../db/schema.js";
import { consumeConfirmationToken, issueConfirmationToken } from "../../domain/confirmation.js";
import { withIdempotency } from "../../domain/idempotency.js";
import { scopedOwnerIds } from "../../lib/actor.js";
import type { ToolDefinition } from "../types.js";

const businessPayload = (input: UpdateOpportunityNextActionInput) => ({
  opportunityId: input.opportunityId,
  nextAction: input.nextAction,
  nextActionDueAt: input.nextActionDueAt,
});

export const updateOpportunityNextAction: ToolDefinition<UpdateOpportunityNextActionInput, unknown> = {
  name: "update_opportunity_next_action",
  description: "更新商机的下一步行动与截止时间。必须先 dry-run 预览，用户确认后提交。",
  inputSchema: UpdateOpportunityNextActionInput,
  kind: "write",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const opportunity = ctx.db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).get();
    if (!opportunity) return { model: fail("NOT_FOUND", "商机不存在") };
    if (!scopedOwnerIds(ctx.db, ctx.actor).includes(opportunity.ownerId)) {
      return { model: fail("FORBIDDEN", "无权操作该商机") };
    }
    if (input.dryRun) {
      const { token, expiresAt } = issueConfirmationToken(ctx.db, {
        actorId: ctx.actor.id,
        toolName: "update_opportunity_next_action",
        payload: businessPayload(input),
      });
      return {
        model: ok({
          status: "pending_confirmation",
          preview: {
            opportunityId: opportunity.id,
            name: opportunity.name,
            nextAction: input.nextAction,
            nextActionDueAt: input.nextActionDueAt,
          },
          expiresAt,
        }),
        artifacts: [
          {
            kind: "next_action",
            toolName: "update_opportunity_next_action",
            title: "下一步行动预览",
            payload: { preview: businessPayload(input), input: businessPayload(input) },
            confirmationToken: token,
          },
        ],
      };
    }
    const result = withIdempotency(
      ctx.db,
      { key: input.idempotencyKey!, actorId: ctx.actor.id, toolName: "update_opportunity_next_action", request: businessPayload(input) },
      () => {
        consumeConfirmationToken(ctx.db, input.confirmationToken!, {
          actorId: ctx.actor.id,
          toolName: "update_opportunity_next_action",
          payload: businessPayload(input),
        });
        ctx.db.update(opportunities).set({
          nextAction: input.nextAction,
          nextActionDueAt: input.nextActionDueAt ?? null,
          updatedAt: Date.now(),
        }).where(eq(opportunities.id, input.opportunityId)).run();
        return { opportunityId: input.opportunityId, nextAction: input.nextAction, nextActionDueAt: input.nextActionDueAt ?? null };
      },
    );
    return { model: ok({ status: "committed", ...result.value, replayed: result.replayed }) };
  },
};
```

- [ ] **Step 5：注册写工具**

在 `apps/server/src/tools/index.ts`：

```ts
import { logFollowUp } from "./write/logFollowUp.js";
import { updateOpportunityNextAction } from "./write/updateOpportunityNextAction.js";

export const writeTools = [
  createQuote,
  convertQuoteToOrder,
  createAfterSalesTicket,
  logFollowUp,
  updateOpportunityNextAction,
] as ToolDefinition<any, any>[];
```

- [ ] **Step 6：运行测试确认通过**

Run: `pnpm --filter @salespilot/server exec vitest run src/tools/proactive-tools.test.ts src/tools/write-tools.test.ts`
Expected: PASS。

- [ ] **Step 7：提交**

```bash
git add apps/server/src/tools/write/logFollowUp.ts apps/server/src/tools/write/updateOpportunityNextAction.ts apps/server/src/tools/index.ts apps/server/src/tools/proactive-tools.test.ts
git commit -m "feat: add follow-up and next-action write tools"
```

---

## Task 11：Prompt、Mock 与评测

**Files:**
- Modify: `apps/server/src/agent/prompts.ts`
- Modify: `apps/server/src/agent/mockProvider.ts`
- Modify: `apps/server/src/eval/run.ts`
- Modify: `evals/golden-cases.json`
- Test: `apps/server/src/agent/graph.test.ts`

- [ ] **Step 1：写失败测试**

在 `apps/server/src/agent/graph.test.ts` 追加：

```ts
it("promotes a customer through proactive tools", async () => {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  const events: any[] = [];
  const ctx = { db, sqlite, actor, traceId: "t_promote", emit: (event: any) => events.push(event) };
  const graph = buildAgentGraph({ provider: new MockProvider(), ctx, allTools });
  await graph.invoke({
    messages: [{ role: "user", content: "帮我推进华辰设计" }],
    actor,
    traceId: "t_promote",
    intent: "business",
    stepCount: 0,
    pendingConfirmation: false,
    citations: [],
    toolCalls: [],
    toolCounts: {},
    budgetExceeded: false,
    finalText: "",
  });
  const toolNames = events.filter((event) => event.type === "step.start").map((event) => event.name);
  expect(toolNames).toContain("get_opportunity_detail");
  expect(toolNames).toContain("check_inventory");
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm --filter @salespilot/server exec vitest run src/agent/graph.test.ts`
Expected: FAIL，Mock 没有主动推进脚本。

- [ ] **Step 3：更新系统提示**

在 `apps/server/src/agent/prompts.ts` 的规则末尾追加：

```text
10. 用户要求“推进某客户/某商机”时，先调用 get_opportunity_detail 或 get_customer_360，再按需调用 check_inventory / get_pricing / get_sales_priorities。
11. 主动推进的输出结构：结论；关键发现（最多 3 条）；建议动作；可继续执行的选项（最多 4 个，标注序号）。
12. 经理询问“团队/本月”时，使用 scope="team"；销售只能使用 scope="self"。
```

- [ ] **Step 4：更新 Mock Provider**

在 `apps/server/src/agent/mockProvider.ts` 顶部加：

```ts
function pickOpportunityId(user: string) {
  if (user.includes("远山")) return "o_yuanshan_storage";
  if (user.includes("星河")) return "o_xinghe_maintenance";
  if (user.includes("智航")) return "o_zhihang_server";
  return "o_huachen_server";
}
```

在 `route` 方法的最前面（`if (user.includes("晨报"))` 之前）加：

```ts
if (user.includes("推进")) {
  if (!hasTool(messages, "get_opportunity_detail")) {
    return toolResponse("get_opportunity_detail", { opportunityId: pickOpportunityId(user) });
  }
  if (!hasTool(messages, "check_inventory")) {
    return toolResponse("check_inventory", { skuQuery: "SRV", quantity: 20 });
  }
  return textResponse(
    "我先分析了这个商机：客户处于报价阶段，最近一次跟进后已有 5 天没有新进展；关联报价将在 48 小时内到期；当前 SRV 可用库存低于需求。\n建议：今天先联系采购确认预算审批与交付时间，再决定是否申请备货或调拨。\n我可以继续帮你：① 生成跟进话术 ② 记录本次跟进 ③ 调整下一步时间 ④ 准备新的报价。",
  );
}
if (user.includes("今天") && (user.includes("跟进") || user.includes("最值得"))) {
  if (!hasTool(messages, "get_sales_priorities")) return toolResponse("get_sales_priorities", { scope: "self", limit: 3 });
  return textResponse("已按金额、成交概率、跟进紧迫度和风险排序；最值得先推进的是华辰设计的服务器采购。");
}
if (user.includes("最危险") || user.includes("风险商机")) {
  if (!hasTool(messages, "get_sales_priorities")) return toolResponse("get_sales_priorities", { scope: "team", focus: "risk", limit: 3 });
  return textResponse("团队当前有 3 个高风险商机，最高风险是华辰设计的服务器采购：报价后 5 天未跟进，且库存不足。");
}
if (user.includes("记录跟进")) {
  if (!hasTool(messages, "log_follow_up")) {
    return toolResponse("log_follow_up", {
      customerId: "c_huachen",
      opportunityId: "o_huachen_server",
      type: "call",
      content: user.replace(/^.*?记录跟进[：:]\s*/, "").slice(0, 200) || "已联系客户，确认预算审批进度",
      result: "客户表示本周内答复",
      nextAction: "周五再次联系采购",
      nextActionDueAt: Date.now() + 3 * 86_400_000,
      dryRun: true,
    });
  }
  return textResponse("已生成跟进记录预览，请在下方确认。");
}
if (user.includes("下一步改成") || user.includes("接受建议")) {
  if (!hasTool(messages, "update_opportunity_next_action")) {
    return toolResponse("update_opportunity_next_action", {
      opportunityId: pickOpportunityId(user),
      nextAction: "周五确认预算",
      nextActionDueAt: Date.now() + 3 * 86_400_000,
      dryRun: true,
    });
  }
  return textResponse("已生成下一步行动预览，请在下方确认。");
}
```

- [ ] **Step 5：更新评测 runner 的经理判定**

在 `apps/server/src/eval/run.ts` 把：

```ts
const useManager = testCase.input.includes("团队");
```

改为：

```ts
const useManager = testCase.input.includes("团队") || testCase.input.includes("本月");
```

- [ ] **Step 6：追加 golden cases**

在 `evals/golden-cases.json` 数组末尾追加（注意在 E25 行末补一个逗号）：

```json
{"id":"E26","input":"帮我推进华辰设计","expectedTools":["get_opportunity_detail","check_inventory"],"category":"proactive"},
{"id":"E27","input":"今天哪些客户最值得跟进","expectedTools":["get_sales_priorities"],"category":"proactive"},
{"id":"E28","input":"本月哪些单最危险","expectedTools":["get_sales_priorities"],"category":"proactive"},
{"id":"E29","input":"记录跟进：已联系华辰采购，预算本周确认","expectedTools":["log_follow_up"],"category":"proactive"},
{"id":"E30","input":"把华辰服务器的下一步改成周五确认预算","expectedTools":["update_opportunity_next_action"],"category":"proactive"}
```

- [ ] **Step 7：运行测试与评测**

Run:

```bash
pnpm --filter @salespilot/server exec vitest run src/agent/graph.test.ts
pnpm eval
```

Expected: graph 测试 PASS；`pnpm eval` 30 条用例通过率 100%，并更新 `docs/EVAL_REPORT.md`。

- [ ] **Step 8：提交**

```bash
git add apps/server/src/agent/prompts.ts apps/server/src/agent/mockProvider.ts apps/server/src/eval/run.ts evals/golden-cases.json apps/server/src/agent/graph.test.ts docs/EVAL_REPORT.md
git commit -m "feat: add proactive AI prompts, mock flows and evals"
```

---

# Phase 4：前端作战室

## Task 12：先写 E2E 失败测试

**Files:**
- Create: `apps/web/tests/e2e/war-room.spec.ts`

- [ ] **Step 1：写 E2E 测试**

创建 `apps/web/tests/e2e/war-room.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/demo/reset");
  expect(response.ok()).toBeTruthy();
});

test("war room shows priorities and records a follow-up", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("AI 今日建议")).toBeVisible();
  await expect(page.getByTestId("priority-card").first()).toContainText("华辰设计");
  await expect(page.getByTestId("priority-card").first()).toContainText("服务器采购");
  await expect(page.getByTestId("priority-card").first()).toContainText("P0");

  await page.getByTestId("priority-card").first().getByRole("link", { name: "查看客户" }).click();
  await expect(page).toHaveURL(/\/customers\/c_huachen/);
  await expect(page.getByText("客户推进中心")).toBeVisible();
  await expect(page.getByText("服务器采购").first()).toBeVisible();

  await page.getByRole("button", { name: "记录跟进" }).first().click();
  await page.getByLabel("跟进内容").fill("已电话联系采购，预算本周确认");
  await page.getByLabel("跟进结果").fill("客户周五给答复");
  await page.getByRole("button", { name: "保存跟进" }).click();
  await expect(page.getByText("跟进已记录")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("已电话联系采购，预算本周确认")).toBeVisible();
});

test("manager sees team risks and ranking", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("combobox", { name: "切换角色" }).selectOption("u_manager_wang");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("团队作战室")).toBeVisible();
  await expect(page.getByText("销售排行")).toBeVisible();
  await expect(page.getByText("高风险商机")).toBeVisible();
  await expect(page.getByText("小王")).toBeVisible();
});

test("AI promotes a customer with tool calls", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByTestId("priority-card").first().getByRole("button", { name: "让 AI 帮我推进" }).click();
  await expect(page.getByTestId("ai-drawer")).toBeVisible();
  await expect(page.getByText("我先分析了这个商机", { exact: false })).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm test:e2e -- --grep "war room"`
Expected: FAIL，页面还没有“AI 今日建议”。

- [ ] **Step 3：提交（失败测试先入库）**

```bash
git add apps/web/tests/e2e/war-room.spec.ts
git commit -m "test: add war room e2e expectations"
```

---

## Task 13：前端 API 与类型

**Files:**
- Create: `apps/web/src/api/workspace.ts`
- Modify: `apps/web/src/api/business.ts`

- [ ] **Step 1：扩展 business.ts 类型与 PATCH 方法**

先把 `apiRequest` 的方法类型从 `"GET" | "POST"` 扩展为 `"GET" | "POST" | "PATCH"`，并在 `apiPost` 之后加：

```ts
export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>("PATCH", path, body);
}
```

然后在 `apps/web/src/api/business.ts` 追加：

```ts
import type {
  FollowUpType,
  OpportunitySignals,
  OpportunityStage,
  PriorityItem,
  RiskLevel,
  TodoItem,
} from "@salespilot/shared";

export interface OpportunityRow {
  id: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  amountCents: number;
  stage: OpportunityStage;
  probability: number;
  expectedCloseDate: number;
  nextAction: string | null;
  nextActionDueAt: number | null;
  riskLevel: RiskLevel;
  lastFollowUpAt: number | null;
  createdAt: number;
  updatedAt: number;
  priority: "P0" | "P1" | "P2" | null;
  score: number | null;
  reasons: string[];
  suggestedAction: string | null;
}

export interface FollowUpRow {
  id: string;
  customerId: string;
  opportunityId: string | null;
  actorId: string;
  type: FollowUpType;
  content: string;
  result: string | null;
  nextAction: string | null;
  nextActionDueAt: number | null;
  createdAt: number;
}

export interface CustomerAssessment {
  summary: string;
  positiveSignals: string[];
  risks: string[];
  suggestion: string;
  nextAction: string | null;
}

export interface CustomerDetailResponse {
  customer: CustomerRow;
  contacts: ContactRow[];
  credit: CreditInfo;
  quotes: QuoteRow[];
  orders: OrderRow[];
  tickets: TicketRow[];
  opportunities: OpportunityRow[];
  followUps: FollowUpRow[];
  assessment: CustomerAssessment;
}

export interface WorkspaceMetrics {
  monthSalesCents: number;
  monthTargetCents: number;
  completionRate: number;
  expectedCloseCents: number;
  activeOpportunities: number;
  highRiskOpportunities: number;
  pendingApprovals: number;
  todayFollowUps: number;
  overdueFollowUps: number;
}

export interface SalesRankingRow {
  ownerId: string;
  ownerName: string;
  monthSalesCents: number;
  pipelineCents: number;
  targetCents: number;
  completionRate: number;
  trend: "up" | "flat" | "down";
}

export interface WorkspaceResponse {
  ok: true;
  scope: "self" | "team";
  actor: ActorProfile;
  metrics: WorkspaceMetrics;
  headline: string;
  priorities: PriorityItem[];
  todos: {
    today: TodoItem[];
    overdue: TodoItem[];
    approvals: TodoItem[];
    quotesToAdvance: TodoItem[];
    quotesExpiring: TodoItem[];
    tickets: TodoItem[];
    orders: TodoItem[];
  };
  risks: PriorityItem[];
  ranking?: SalesRankingRow[];
  recentQuotes: QuoteRow[];
  recentOrders: OrderRow[];
  alerts: AlertRow[];
}

export interface OpportunitiesResponse {
  ok: true;
  opportunities: OpportunityRow[];
}

export interface OpportunityDetailResponse {
  ok: true;
  opportunity: Omit<OpportunityRow, "customerName" | "ownerName" | "priority" | "score" | "reasons" | "suggestedAction"> & {
    customerName?: string;
    ownerName?: string | null;
  };
  customer: CustomerRow;
  quotes: QuoteRow[];
  orders: OrderRow[];
  followUps: FollowUpRow[];
  priority: PriorityItem;
  assessment: CustomerAssessment;
}

export type { FollowUpType, OpportunityStage, PriorityItem, RiskLevel, TodoItem, OpportunitySignals };
```

注意：`CustomerDetailResponse` 在原文件已有定义；用 Edit 替换原定义，不要重复声明。

- [ ] **Step 2：新增 workspace API 辅助**

创建 `apps/web/src/api/workspace.ts`：

```ts
import { apiGet, apiPatch, apiPost, type OpportunityDetailResponse, type OpportunitiesResponse, type WorkspaceResponse } from "./business";

export function fetchWorkspace() {
  return apiGet<WorkspaceResponse>("/api/business/workspace");
}

export function fetchOpportunities(query: { stage?: string; risk?: string; customerId?: string } = {}) {
  const params = new URLSearchParams();
  if (query.stage) params.set("stage", query.stage);
  if (query.risk) params.set("risk", query.risk);
  if (query.customerId) params.set("customerId", query.customerId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiGet<OpportunitiesResponse>(`/api/business/opportunities${suffix}`);
}

export function fetchOpportunity(id: string) {
  return apiGet<OpportunityDetailResponse>(`/api/business/opportunities/${id}`);
}

export function updateOpportunity(
  id: string,
  patch: {
    stage?: string;
    probability?: number;
    riskLevel?: string;
    nextAction?: string | null;
    nextActionDueAt?: number | null;
    amountCents?: number;
    expectedCloseDate?: number;
  },
) {
  return apiPatch<{ ok: true; opportunity: unknown }>(`/api/business/opportunities/${id}`, patch);
}

export function recordFollowUp(input: {
  customerId: string;
  opportunityId?: string;
  type: string;
  content: string;
  result?: string;
  nextAction?: string;
  nextActionDueAt?: number;
}) {
  return apiPost<{ ok: true; followUp: unknown }>("/api/business/follow-ups", input);
}
```

- [ ] **Step 3：类型检查**

Run: `pnpm --filter @salespilot/web typecheck`
Expected: PASS（页面尚未使用新类型）。

- [ ] **Step 4：提交**

```bash
git add apps/web/src/api/business.ts apps/web/src/api/workspace.ts
git commit -m "feat: add workspace client types"
```

---

## Task 14：通用组件

**Files:**
- Create: `apps/web/src/lib/opportunity.ts`
- Create: `apps/web/src/components/PriorityCard.tsx`
- Create: `apps/web/src/components/TodoPanel.tsx`
- Create: `apps/web/src/components/AIAssessmentCard.tsx`
- Create: `apps/web/src/components/FollowUpModal.tsx`

- [ ] **Step 1：阶段与优先级展示工具**

创建 `apps/web/src/lib/opportunity.ts`：

```ts
import type { PriorityItem, RiskLevel } from "@salespilot/shared";
import type { BadgeTone } from "../components/ui/Badge";

export const STAGE_LABELS: Record<string, string> = {
  lead: "线索",
  needs: "需求确认",
  solution: "方案沟通",
  quote: "报价",
  negotiation: "谈判",
  won: "成交",
  lost: "丢单",
};

export const RISK_LABELS: Record<RiskLevel, string> = { low: "低风险", medium: "中风险", high: "高风险" };

export function stageTone(stage: string): BadgeTone {
  if (stage === "won") return "success";
  if (stage === "lost") return "neutral";
  if (stage === "quote" || stage === "negotiation") return "teal";
  return "info";
}

export function riskTone(risk: RiskLevel): BadgeTone {
  return risk === "high" ? "danger" : risk === "medium" ? "warning" : "success";
}

export function priorityTone(priority: PriorityItem["priority"]): BadgeTone {
  return priority === "P0" ? "danger" : priority === "P1" ? "warning" : "neutral";
}

export function priorityLabel(priority: PriorityItem["priority"]) {
  return priority === "P0" ? "P0 今天必须处理" : priority === "P1" ? "P1 今天建议处理" : "P2 本周处理";
}
```

- [ ] **Step 2：PriorityCard**

创建 `apps/web/src/components/PriorityCard.tsx`：

```tsx
import type { PriorityItem } from "@salespilot/shared";
import { Link } from "react-router-dom";
import { ArrowRight, Bot, ClipboardList, User } from "lucide-react";
import { formatMoney } from "../lib/utils";
import { priorityLabel, priorityTone, riskTone, RISK_LABELS, STAGE_LABELS, stageTone } from "../lib/opportunity";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

export function PriorityCard({
  item,
  onAskAI,
  onLogFollowUp,
}: {
  item: PriorityItem;
  onAskAI: (item: PriorityItem) => void;
  onLogFollowUp: (item: PriorityItem) => void;
}) {
  return (
    <article data-testid="priority-card" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</Badge>
          <Badge tone={riskTone(item.riskLevel)}>{RISK_LABELS[item.riskLevel]}</Badge>
          <Badge tone={stageTone(item.stage)}>{STAGE_LABELS[item.stage] ?? item.stage}</Badge>
        </div>
        <div className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(item.amountCents)}</div>
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <User size={14} className="text-slate-400" />
          {item.customerName}
          <span className="text-slate-300">·</span>
          <span className="font-medium text-slate-700">{item.name}</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          成交概率 {item.probability}% · 优先级得分 {item.score}
          {item.ownerName ? ` · 负责人 ${item.ownerName}` : ""}
        </div>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        {item.reasons.map((reason) => (
          <li key={reason} className="flex gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-lg bg-teal-50 p-2.5 text-xs text-teal-900">
        <span className="font-medium">建议：</span>
        {item.suggestedAction}
      </div>

      {item.nextAction ? (
        <div className="mt-2 text-[11px] text-slate-500">
          下一步：{item.nextAction}
          {item.nextActionDueAt ? ` · 截止 ${new Date(item.nextActionDueAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={`/customers/${item.customerId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          查看客户
        </Link>
        <Link
          to={`/opportunities/${item.opportunityId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          查看商机 <ArrowRight size={12} />
        </Link>
        <Button size="sm" onClick={() => onAskAI(item)}>
          <Bot size={13} /> 让 AI 帮我推进
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onLogFollowUp(item)}>
          <ClipboardList size={13} /> 记录跟进
        </Button>
      </div>
    </article>
  );
}
```

- [ ] **Step 3：TodoPanel**

创建 `apps/web/src/components/TodoPanel.tsx`：

```tsx
import { Link } from "react-router-dom";
import type { TodoItem } from "@salespilot/shared";
import { Card, CardBody, CardHeader } from "./ui/Card";
import { Badge } from "./ui/Badge";

const KIND_LABELS: Record<string, string> = {
  today_follow_up: "今日跟进",
  overdue_follow_up: "逾期跟进",
  approval: "待审批",
  quote_to_advance: "待推进报价",
  quote_expiring: "报价到期",
  ticket: "售后待处理",
  order: "待确认订单",
};

export function TodoPanel({
  groups,
}: {
  groups: {
    today: TodoItem[];
    overdue: TodoItem[];
    approvals: TodoItem[];
    quotesToAdvance: TodoItem[];
    quotesExpiring: TodoItem[];
    tickets: TodoItem[];
    orders: TodoItem[];
  };
}) {
  const all = [
    ...groups.overdue,
    ...groups.today,
    ...groups.approvals,
    ...groups.orders,
    ...groups.quotesExpiring,
    ...groups.quotesToAdvance,
    ...groups.tickets,
  ];
  return (
    <Card>
      <CardHeader
        title="我的待办"
        description="按紧急程度排序"
        actions={<span className="text-[11px] text-slate-400">{all.length} 项</span>}
      />
      <CardBody className="space-y-2">
        {all.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">今天没有待办，保持节奏。</div>
        ) : (
          all.slice(0, 10).map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs hover:border-teal-200 hover:bg-teal-50/40"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={item.severity === "blocker" ? "danger" : item.severity === "warning" ? "warning" : "info"}>
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </Badge>
                  <span className="truncate font-medium text-slate-800">{item.title}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">{item.subtitle}</div>
              </div>
            </Link>
          ))
        )}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 4：AIAssessmentCard**

创建 `apps/web/src/components/AIAssessmentCard.tsx`：

```tsx
import { Bot, CheckCircle2, AlertTriangle } from "lucide-react";
import type { CustomerAssessment } from "../api/business";
import { Card, CardBody, CardHeader } from "./ui/Card";

export function AIAssessmentCard({ assessment, title = "AI 客户判断" }: { assessment: CustomerAssessment; title?: string }) {
  return (
    <Card className="border-teal-100">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <Bot size={15} className="text-teal-700" />
            {title}
          </span>
        }
        description="基于当前商机、跟进、信用与库存信号"
      />
      <CardBody className="space-y-3 text-xs">
        <p className="leading-relaxed text-slate-700">{assessment.summary}</p>
        {assessment.positiveSignals.length > 0 ? (
          <div>
            <div className="mb-1 font-medium text-emerald-700">积极信号</div>
            <ul className="space-y-1">
              {assessment.positiveSignals.map((signal) => (
                <li key={signal} className="flex gap-1.5 text-slate-600">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                  {signal}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {assessment.risks.length > 0 ? (
          <div>
            <div className="mb-1 font-medium text-rose-700">风险</div>
            <ul className="space-y-1">
              {assessment.risks.map((risk) => (
                <li key={risk} className="flex gap-1.5 text-slate-600">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-rose-500" />
                  {risk}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="rounded-lg bg-teal-50 p-2.5 text-teal-900">
          <span className="font-medium">建议：</span>
          {assessment.suggestion}
        </div>
        {assessment.nextAction ? <div className="text-[11px] text-slate-500">下一步：{assessment.nextAction}</div> : null}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 5：FollowUpModal**

创建 `apps/web/src/components/FollowUpModal.tsx`：

```tsx
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
```

- [ ] **Step 6：类型检查**

Run: `pnpm --filter @salespilot/web typecheck`
Expected: PASS。

- [ ] **Step 7：提交**

```bash
git add apps/web/src/lib/opportunity.ts apps/web/src/components/PriorityCard.tsx apps/web/src/components/TodoPanel.tsx apps/web/src/components/AIAssessmentCard.tsx apps/web/src/components/FollowUpModal.tsx
git commit -m "feat: add war room UI components"
```

---

## Task 15：作战室首页

**Files:**
- Modify: `apps/web/src/pages/Dashboard.tsx`

- [ ] **Step 1：替换 Dashboard**

把 `apps/web/src/pages/Dashboard.tsx` 替换为：

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, FileText, Target, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import type { PriorityItem } from "@salespilot/shared";
import { useAppStore, useRole } from "../state/store";
import { useApi, type WorkspaceResponse } from "../api/business";
import { formatMoney } from "../lib/utils";
import { statusLabel, statusTone } from "../lib/status";
import { PageHeader, StatCard } from "../components/ui/Page";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { PriorityCard } from "../components/PriorityCard";
import { TodoPanel } from "../components/TodoPanel";
import { FollowUpModal } from "../components/FollowUpModal";

export function Dashboard() {
  const navigate = useNavigate();
  const role = useRole();
  const { openAi, queuePrompt } = useAppStore();
  const { data, loading, error, refetch } = useApi<WorkspaceResponse>("/api/business/workspace");
  const [followUpTarget, setFollowUpTarget] = useState<PriorityItem | null>(null);

  function askAi(item: PriorityItem) {
    openAi(`正在推进 ${item.customerName} · ${item.name}`);
    queuePrompt(`帮我推进${item.customerName}`);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={role === "manager" ? "团队作战室" : "今日作战室"}
        description={
          role === "manager"
            ? "团队销售全局、风险商机与待审批"
            : `${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })} · 先处理最值得推进的客户`
        }
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => navigate("/opportunities")}>
              <Target size={14} /> 查看商机
            </Button>
            <Button size="sm" onClick={() => navigate("/quotes/new")}>
              <FileText size={14} /> 新建报价
            </Button>
          </>
        }
      />

      {loading && !data ? <LoadingBlock label="正在计算今日优先级…" /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="本月销售额" value={formatMoney(data.metrics.monthSalesCents)} icon={<Wallet size={15} />} tone="teal" />
            <StatCard
              label={role === "manager" ? "团队目标完成率" : "本月目标完成率"}
              value={`${Math.round(data.metrics.completionRate * 100)}%`}
              hint={`目标 ${formatMoney(data.metrics.monthTargetCents)}`}
              icon={<Target size={15} />}
              tone={data.metrics.completionRate >= 0.8 ? "teal" : data.metrics.completionRate >= 0.5 ? "amber" : "rose"}
            />
            <StatCard label="预计成交" value={formatMoney(data.metrics.expectedCloseCents)} icon={<TrendingUp size={15} />} />
            <StatCard label="进行中商机" value={data.metrics.activeOpportunities} icon={<Users size={15} />} />
            <StatCard label="高风险商机" value={data.metrics.highRiskOpportunities} icon={<TrendingDown size={15} />} tone={data.metrics.highRiskOpportunities > 0 ? "rose" : "slate"} />
          </div>

          <Card className="border-teal-100">
            <CardHeader
              title={
                <span className="flex items-center gap-1.5">
                  <Bot size={15} className="text-teal-700" /> AI 今日建议
                </span>
              }
              description={data.headline}
              actions={<span className="text-[11px] text-slate-400">按金额 × 概率 × 紧迫度 × 风险排序</span>}
            />
            <CardBody className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {data.priorities.length === 0 ? (
                <EmptyState title="今天没有需要紧急推进的商机" description="可以整理客户资料或开发新线索。" />
              ) : (
                data.priorities.map((item) => (
                  <PriorityCard key={item.opportunityId} item={item} onAskAI={askAi} onLogFollowUp={setFollowUpTarget} />
                ))
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TodoPanel groups={data.todos} />

            <Card>
              <CardHeader title="风险商机" description="高风险或 P0 商机" actions={<Link to="/opportunities?risk=high" className="text-[11px] font-medium text-teal-700 hover:underline">全部商机</Link>} />
              <CardBody className="space-y-2">
                {data.risks.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">暂无高风险商机</div>
                ) : (
                  data.risks.map((item) => (
                    <Link
                      key={item.opportunityId}
                      to={`/opportunities/${item.opportunityId}`}
                      className="block rounded-lg border border-slate-200 p-2.5 text-xs hover:border-rose-200 hover:bg-rose-50/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{item.customerName} · {item.name}</span>
                        <span className="tabular-nums text-slate-700">{formatMoney(item.amountCents)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{item.reasons.slice(0, 2).join("；")}</div>
                    </Link>
                  ))
                )}
              </CardBody>
            </Card>
          </div>

          {role === "manager" && data.ranking ? (
            <Card>
              <CardHeader title="销售排行" description="本月销售额与管道金额" actions={<Badge tone="teal">团队</Badge>} />
              <div className="p-3">
                <Table>
                  <THead>
                    <TR>
                      <TH>销售</TH>
                      <TH className="text-right">本月销售额</TH>
                      <TH className="text-right">管道金额</TH>
                      <TH className="text-right">目标完成率</TH>
                      <TH>趋势</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.ranking.map((row) => (
                      <TR key={row.ownerId}>
                        <TD className="font-medium text-slate-800">{row.ownerName}</TD>
                        <TD className="text-right tabular-nums">{formatMoney(row.monthSalesCents)}</TD>
                        <TD className="text-right tabular-nums">{formatMoney(row.pipelineCents)}</TD>
                        <TD className="text-right tabular-nums">{Math.round(row.completionRate * 100)}%</TD>
                        <TD>
                          <Badge tone={row.trend === "up" ? "success" : row.trend === "flat" ? "warning" : "danger"}>
                            {row.trend === "up" ? "↑ 上升" : row.trend === "flat" ? "→ 持平" : "↓ 落后"}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="最近报价" actions={<Link to="/quotes" className="text-[11px] font-medium text-teal-700 hover:underline">全部报价</Link>} />
              <div className="p-3">
                {data.recentQuotes.length === 0 ? (
                  <EmptyState title="暂无报价" />
                ) : (
                  <Table>
                    <THead>
                      <TR><TH>报价单</TH><TH>客户</TH><TH>状态</TH><TH className="text-right">金额</TH></TR>
                    </THead>
                    <TBody>
                      {data.recentQuotes.map((quote) => (
                        <TR key={quote.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/quotes/${quote.id}`)}>
                          <TD className="font-medium text-slate-800">{quote.quoteNo}</TD>
                          <TD>{quote.customerName ?? "—"}</TD>
                          <TD><Badge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</Badge></TD>
                          <TD className="text-right tabular-nums">{formatMoney(quote.totalCents)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="最近订单" description="按创建时间倒序" actions={<Link to="/orders" className="text-[11px] font-medium text-teal-700 hover:underline">全部订单</Link>} />
              <div className="p-3">
                {data.recentOrders.length === 0 ? (
                  <EmptyState title="暂无订单" />
                ) : (
                  <Table>
                    <THead>
                      <TR><TH>订单</TH><TH>客户</TH><TH>状态</TH><TH className="text-right">金额</TH></TR>
                    </THead>
                    <TBody>
                      {data.recentOrders.map((order) => (
                        <TR key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${order.id}`)}>
                          <TD className="font-medium text-slate-800">{order.orderNo}</TD>
                          <TD>{order.customerName ?? "—"}</TD>
                          <TD><Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge></TD>
                          <TD className="text-right tabular-nums">{formatMoney(order.totalCents)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {followUpTarget ? (
        <FollowUpModal
          open={Boolean(followUpTarget)}
          onClose={() => setFollowUpTarget(null)}
          customerId={followUpTarget.customerId}
          opportunityId={followUpTarget.opportunityId}
          onSaved={refetch}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2：类型检查**

Run: `pnpm --filter @salespilot/web typecheck`
Expected: PASS。若 `WorkspaceResponse` 的 `recentQuotes` 类型与 `QuoteRow` 不兼容，把 `recentQuotes` 的类型改为 `QuoteRow[]` 并在 API 中保持字段一致。

- [ ] **Step 3：启动页面人工检查**

Run: `pnpm dev`，打开 <http://127.0.0.1:5173/dashboard>。
Expected: 看到“AI 今日建议”、华辰设计 P0 卡片、指标条、待办与风险商机。

- [ ] **Step 4：提交**

```bash
git add apps/web/src/pages/Dashboard.tsx
git commit -m "feat: rebuild dashboard as sales war room"
```

---

## Task 16：商机列表与详情

**Files:**
- Create: `apps/web/src/pages/Opportunities.tsx`
- Create: `apps/web/src/pages/OpportunityDetail.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1：商机列表**

创建 `apps/web/src/pages/Opportunities.tsx`：

```tsx
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi, type OpportunitiesResponse } from "../api/business";
import { formatMoney } from "../lib/utils";
import { formatDate } from "../lib/status";
import { RISK_LABELS, STAGE_LABELS, priorityTone, riskTone, stageTone } from "../lib/opportunity";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Select } from "../components/ui/Field";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";

const STAGES = ["lead", "needs", "solution", "quote", "negotiation", "won", "lost"];

export function Opportunities() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState(searchParams.get("stage") ?? "");
  const [risk, setRisk] = useState(searchParams.get("risk") ?? "");
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  if (risk) params.set("risk", risk);
  const { data, loading, error, refetch } = useApi<OpportunitiesResponse>(`/api/business/opportunities${params.toString() ? `?${params.toString()}` : ""}`);

  return (
    <div>
      <PageHeader
        title="商机"
        description="一个客户可以有多个商机；按阶段、风险与金额查看"
        actions={
          <>
            <Select aria-label="筛选阶段" value={stage} onChange={(event) => setStage(event.target.value)} className="w-32">
              <option value="">全部阶段</option>
              {STAGES.map((value) => <option key={value} value={value}>{STAGE_LABELS[value] ?? value}</option>)}
            </Select>
            <Select aria-label="筛选风险" value={risk} onChange={(event) => setRisk(event.target.value)} className="w-32">
              <option value="">全部风险</option>
              <option value="high">高风险</option>
              <option value="medium">中风险</option>
              <option value="low">低风险</option>
            </Select>
          </>
        }
      />

      {loading && !data ? <LoadingBlock label="加载商机…" /> : null}
      {error ? <ErrorBanner message={error} onRetry={refetch} /> : null}

      {data ? (
        data.opportunities.length === 0 ? (
          <EmptyState title="暂无商机" description="调整筛选条件，或从客户页面创建商机。" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>客户 / 商机</TH>
                <TH>阶段</TH>
                <TH>优先级</TH>
                <TH>风险</TH>
                <TH className="text-right">金额</TH>
                <TH>下一步</TH>
                <TH>负责人</TH>
              </TR>
            </THead>
            <TBody>
              {data.opportunities.map((row) => (
                <TR key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/opportunities/${row.id}`)}>
                  <TD>
                    <div className="font-medium text-slate-800">{row.customerName}</div>
                    <div className="text-[11px] text-slate-500">{row.name}</div>
                  </TD>
                  <TD><Badge tone={stageTone(row.stage)}>{STAGE_LABELS[row.stage] ?? row.stage}</Badge></TD>
                  <TD>{row.priority ? <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge> : "—"}</TD>
                  <TD><Badge tone={riskTone(row.riskLevel)}>{RISK_LABELS[row.riskLevel]}</Badge></TD>
                  <TD className="text-right tabular-nums">{formatMoney(row.amountCents)}</TD>
                  <TD className="max-w-[220px] truncate">{row.nextAction ?? "—"}{row.nextActionDueAt ? ` · ${formatDate(row.nextActionDueAt)}` : ""}</TD>
                  <TD>{row.ownerName ?? row.ownerId}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2：商机详情**

创建 `apps/web/src/pages/OpportunityDetail.tsx`：

```tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, ClipboardList, FileText, Phone } from "lucide-react";
import type { PriorityItem } from "@salespilot/shared";
import { errorMessage, useApi, type OpportunityDetailResponse } from "../api/business";
import { updateOpportunity } from "../api/workspace";
import { useAppStore } from "../state/store";
import { formatMoney } from "../lib/utils";
import { formatDateTime, statusLabel, statusTone } from "../lib/status";
import { RISK_LABELS, STAGE_LABELS, priorityLabel, priorityTone, riskTone, stageTone } from "../lib/opportunity";
import { PageHeader } from "../components/ui/Page";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { ErrorBanner, LoadingBlock } from "../components/ui/Feedback";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { AIAssessmentCard } from "../components/AIAssessmentCard";
import { FollowUpModal } from "../components/FollowUpModal";

export function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openAi, queuePrompt, pushToast } = useAppStore();
  const { data, loading, error, refetch } = useApi<OpportunityDetailResponse>(id ? `/api/business/opportunities/${id}` : null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draftAction, setDraftAction] = useState("");
  const [draftDue, setDraftDue] = useState("");

  if (loading && !data) return <LoadingBlock label="加载商机…" />;
  if (error) return <ErrorBanner message={error} onRetry={refetch} />;
  if (!data) return null;

  const { opportunity, customer, quotes, orders, followUps, priority, assessment } = data;

  function askAi(item: PriorityItem) {
    openAi(`正在推进 ${item.customerName} · ${item.name}`);
    queuePrompt(`帮我推进${item.customerName}`);
  }

  async function acceptSuggestion() {
    try {
      await updateOpportunity(opportunity.id, {
        nextAction: priority.suggestedAction,
        nextActionDueAt: Date.now() + 4 * 3600_000,
      });
      pushToast("已接受 AI 建议", "success");
      refetch();
    } catch (caught) {
      pushToast(errorMessage(caught), "error");
    }
  }

  async function saveNextAction() {
    if (!draftAction.trim()) return;
    try {
      await updateOpportunity(opportunity.id, {
        nextAction: draftAction.trim(),
        nextActionDueAt: draftDue ? new Date(`${draftDue}T17:00:00`).getTime() : null,
      });
      pushToast("下一步已更新", "success");
      setEditOpen(false);
      refetch();
    } catch (caught) {
      pushToast(errorMessage(caught), "error");
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate("/opportunities")} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft size={13} /> 返回商机列表
      </button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {customer.name} · {opportunity.name}
            <Badge tone={stageTone(opportunity.stage)}>{STAGE_LABELS[opportunity.stage] ?? opportunity.stage}</Badge>
            <Badge tone={riskTone(opportunity.riskLevel)}>{RISK_LABELS[opportunity.riskLevel]}</Badge>
            <Badge tone={priorityTone(priority.priority)}>{priorityLabel(priority.priority)}</Badge>
          </span>
        }
        description={`${formatMoney(opportunity.amountCents)} · 成交概率 ${opportunity.probability}% · 预计成交 ${new Date(opportunity.expectedCloseDate).toLocaleDateString("zh-CN")}`}
        actions={
          <>
            <Button size="sm" onClick={() => askAi(priority)}>
              <Bot size={14} /> 让 AI 帮我推进
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFollowUpOpen(true)}>
              <ClipboardList size={14} /> 记录跟进
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/quotes/new?customerId=${customer.id}&opportunityId=${opportunity.id}`)}>
              <FileText size={14} /> 新建报价
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="下一步行动" description="商机推进的核心" />
          <CardBody className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">下一步</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{opportunity.nextAction ?? "尚未设置"}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                截止：{opportunity.nextActionDueAt ? formatDateTime(opportunity.nextActionDueAt) : "—"}
              </div>
            </div>
            {!suggestionDismissed ? (
              <div className="rounded-lg bg-teal-50 p-3 text-xs text-teal-900">
                <div><span className="font-medium">AI 建议：</span>{priority.suggestedAction}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={acceptSuggestion}>接受建议</Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDraftAction(priority.suggestedAction);
                      setDraftDue("");
                      setEditOpen(true);
                    }}
                  >
                    修改
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSuggestionDismissed(true)}>
                    忽略
                  </Button>
                </div>
              </div>
            ) : null}
            <ul className="space-y-1 text-xs text-slate-600">
              {priority.reasons.map((reason) => (
                <li key={reason} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {reason}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setFollowUpOpen(true)}>
                <Phone size={13} /> 记录本次跟进
              </Button>
              <Button size="sm" variant="secondary" onClick={() => askAi(priority)}>
                <Bot size={13} /> 让 AI 给出推进方案
              </Button>
            </div>
          </CardBody>
        </Card>

        <AIAssessmentCard assessment={assessment} title="AI 商机判断" />
      </div>

      <Card>
        <CardHeader title="跟进时间线" description={`${followUps.length} 条记录`} />
        <CardBody className="space-y-2">
          {followUps.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">暂无跟进记录</div>
          ) : (
            followUps.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{item.type} · {item.content}</span>
                  <span className="text-[11px] text-slate-400">{formatDateTime(item.createdAt)}</span>
                </div>
                {item.result ? <div className="mt-1 text-slate-600">结果：{item.result}</div> : null}
                {item.nextAction ? <div className="mt-1 text-slate-500">下一步：{item.nextAction}{item.nextActionDueAt ? ` · ${formatDateTime(item.nextActionDueAt)}` : ""}</div> : null}
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="关联报价" description={`${quotes.length} 张`} />
          <div className="p-3">
            {quotes.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">暂无关联报价</div>
            ) : (
              <Table>
                <THead><TR><TH>报价单</TH><TH>状态</TH><TH className="text-right">金额</TH></TR></THead>
                <TBody>
                  {quotes.map((quote) => (
                    <TR key={quote.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/quotes/${quote.id}`)}>
                      <TD className="font-medium text-slate-800">{quote.quoteNo}</TD>
                      <TD><Badge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</Badge></TD>
                      <TD className="text-right tabular-nums">{formatMoney(quote.totalCents)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="关联订单" description={`${orders.length} 笔`} />
          <div className="p-3">
            {orders.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">暂无关联订单</div>
            ) : (
              <Table>
                <THead><TR><TH>订单</TH><TH>状态</TH><TH className="text-right">金额</TH></TR></THead>
                <TBody>
                  {orders.map((order) => (
                    <TR key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${order.id}`)}>
                      <TD className="font-medium text-slate-800">{order.orderNo}</TD>
                      <TD><Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge></TD>
                      <TD className="text-right tabular-nums">{formatMoney(order.totalCents)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="修改下一步"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditOpen(false)}>取消</Button>
            <Button size="sm" onClick={saveNextAction}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="下一步" htmlFor="next-action">
            <Input id="next-action" value={draftAction} onChange={(event) => setDraftAction(event.target.value)} />
          </Field>
          <Field label="截止日期" htmlFor="next-action-due">
            <Input id="next-action-due" type="date" value={draftDue} onChange={(event) => setDraftDue(event.target.value)} />
          </Field>
        </div>
      </Modal>

      <FollowUpModal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        customerId={customer.id}
        opportunityId={opportunity.id}
        onSaved={refetch}
      />
    </div>
  );
}
```

- [ ] **Step 3：注册路由**

在 `apps/web/src/App.tsx` 导入并添加：

```tsx
import { Opportunities } from "./pages/Opportunities";
import { OpportunityDetail } from "./pages/OpportunityDetail";
```

在 `<Route path="/customers/:id" ... />` 之后加：

```tsx
<Route path="/opportunities" element={<Opportunities />} />
<Route path="/opportunities/:id" element={<OpportunityDetail />} />
```

- [ ] **Step 4：让新建报价表单继承 opportunityId**

在 `apps/web/src/pages/QuoteNew.tsx`：

1. 读取查询参数：

```tsx
const opportunityId = searchParams.get("opportunityId") ?? undefined;
```

2. 在 `runPreview` 的请求体中加入：

```tsx
opportunityId,
```

即：

```tsx
const result = await apiPost<QuotePreviewResponse>("/api/business/quotes/preview", {
  customerId,
  contactId,
  lines: lines.map((line) => ({ sku: line.sku, quantity: Number(line.quantity) })),
  notes: notes.trim() || undefined,
  opportunityId,
});
```

提交时继续使用 `payload: preview.input`，服务端返回的 `input` 已包含 `opportunityId`，因此报价会与商机关联。

- [ ] **Step 5：类型检查**

Run: `pnpm --filter @salespilot/web typecheck`
Expected: PASS。

- [ ] **Step 6：提交**

```bash
git add apps/web/src/pages/Opportunities.tsx apps/web/src/pages/OpportunityDetail.tsx apps/web/src/pages/QuoteNew.tsx apps/web/src/App.tsx
git commit -m "feat: add opportunity list and detail pages"
```

---

## Task 17：客户推进中心

**Files:**
- Modify: `apps/web/src/pages/CustomerDetail.tsx`

- [ ] **Step 1：改造 CustomerDetail**

保留现有信用、联系人、报价、订单、售后区块，做以下修改：

1. 顶部导入：

```tsx
import { useState } from "react";
import { Bot, ClipboardList } from "lucide-react";
import type { PriorityItem } from "@salespilot/shared";
import { AIAssessmentCard } from "../components/AIAssessmentCard";
import { FollowUpModal } from "../components/FollowUpModal";
import { RISK_LABELS, STAGE_LABELS, stageTone, riskTone } from "../lib/opportunity";
```

2. 在组件内加状态：

```tsx
const [followUpOpen, setFollowUpOpen] = useState(false);
const [followUpOpportunityId, setFollowUpOpportunityId] = useState<string | undefined>();
```

3. 解构增加：

```tsx
const { customer, contacts, credit, quotes, orders, tickets, opportunities, followUps, assessment } = data;
const activeOpportunities = opportunities.filter((item) => item.priority !== null);
```

4. 把 `PageHeader` 的 `title` 改为：

```tsx
title={
  <span className="flex flex-wrap items-center gap-2">
    {customer.name}
    <Badge tone={LEVEL_TONE[customer.level] ?? "neutral"}>{customer.level} 级</Badge>
    <Badge tone={customer.status === "active" ? "success" : "neutral"}>{customer.status === "active" ? "合作中" : customer.status}</Badge>
    <span className="text-[11px] font-normal text-slate-400">客户推进中心</span>
  </span>
}
```

5. `actions` 改为：

```tsx
actions={
  <>
    <Button size="sm" onClick={() => navigate(`/quotes/new?customerId=${customer.id}`)}>
      <Plus size={14} /> 新建报价
    </Button>
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        openAi(`正在推进 ${customer.name}`);
        queuePrompt(`帮我推进${customer.name}`);
      }}
    >
      <Bot size={14} /> 让 AI 帮我推进
    </Button>
    <Button size="sm" variant="secondary" onClick={() => { setFollowUpOpportunityId(activeOpportunities[0]?.id); setFollowUpOpen(true); }}>
      <ClipboardList size={14} /> 记录跟进
    </Button>
  </>
}
```

删除原来的 `askAi` 函数（已被替换）。

6. 在 `PageHeader` 之后插入“当前商机”与“AI 客户判断”：

```tsx
<div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
  <Card className="xl:col-span-2">
    <CardHeader title="当前商机" description={`${activeOpportunities.length} 个进行中商机`} actions={<Button size="sm" variant="ghost" onClick={() => navigate("/opportunities")}>全部商机</Button>} />
    <CardBody className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 p-2 text-xs">
          <div className="text-slate-400">商机总额</div>
          <div className="mt-0.5 font-semibold tabular-nums text-slate-800">{formatMoney(activeOpportunities.reduce((sum, item) => sum + item.amountCents, 0))}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 text-xs">
          <div className="text-slate-400">历史订单</div>
          <div className="mt-0.5 font-semibold tabular-nums text-slate-800">{formatMoney(orders.reduce((sum, order) => sum + order.totalCents, 0))}</div>
        </div>
      </div>
      {activeOpportunities.length === 0 ? (
        <EmptyState title="暂无进行中商机" description="可以从 AI 助手或商机页面创建。" />
      ) : (
        activeOpportunities.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-slate-900">{item.name}</span>
                  <Badge tone={stageTone(item.stage)}>{STAGE_LABELS[item.stage] ?? item.stage}</Badge>
                  <Badge tone={riskTone(item.riskLevel)}>{RISK_LABELS[item.riskLevel]}</Badge>
                  {item.priority ? <Badge tone={item.priority === "P0" ? "danger" : item.priority === "P1" ? "warning" : "neutral"}>{item.priority}</Badge> : null}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatMoney(item.amountCents)} · 成交概率 {item.probability}%
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/opportunities/${item.id}`)}>查看商机</Button>
            </div>
            <div className="mt-2 text-xs text-slate-600">
              下一步：{item.nextAction ?? "未设置"}
              {item.nextActionDueAt ? ` · 截止 ${formatDateTime(item.nextActionDueAt)}` : ""}
            </div>
            {item.suggestedAction ? <div className="mt-1 text-[11px] text-teal-800">建议：{item.suggestedAction}</div> : null}
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setFollowUpOpportunityId(item.id); setFollowUpOpen(true); }}>记录跟进</Button>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/quotes/new?customerId=${customer.id}&opportunityId=${item.id}`)}>新建报价</Button>
              <Button size="sm" variant="ghost" onClick={() => { openAi(`正在推进 ${customer.name} · ${item.name}`); queuePrompt(`帮我推进${customer.name}`); }}>让 AI 推进</Button>
            </div>
          </div>
        ))
      )}
    </CardBody>
  </Card>
  <AIAssessmentCard assessment={assessment} />
</div>
```

7. 在“最近报价”之前插入跟进时间线：

```tsx
<Card>
  <CardHeader title="跟进时间线" description={`${followUps.length} 条记录`} actions={<Button size="sm" variant="ghost" onClick={() => { setFollowUpOpen(true); }}>记录跟进</Button>} />
  <CardBody className="space-y-2">
    {followUps.length === 0 ? (
      <div className="py-6 text-center text-xs text-slate-400">暂无跟进记录</div>
    ) : (
      followUps.map((item) => (
        <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-800">{item.type} · {item.content}</span>
            <span className="text-[11px] text-slate-400">{formatDateTime(item.createdAt)}</span>
          </div>
          {item.result ? <div className="mt-1 text-slate-600">结果：{item.result}</div> : null}
          {item.nextAction ? <div className="mt-1 text-slate-500">下一步：{item.nextAction}{item.nextActionDueAt ? ` · ${formatDateTime(item.nextActionDueAt)}` : ""}</div> : null}
        </div>
      ))
    )}
  </CardBody>
</Card>
```

8. 在组件末尾（`</div>` 之前）加：

```tsx
<FollowUpModal
  open={followUpOpen}
  onClose={() => setFollowUpOpen(false)}
  customerId={customer.id}
  opportunityId={followUpOpportunityId}
  onSaved={refetch}
/>
```

- [ ] **Step 2：类型检查**

Run: `pnpm --filter @salespilot/web typecheck`
Expected: PASS。

- [ ] **Step 3：提交**

```bash
git add apps/web/src/pages/CustomerDetail.tsx
git commit -m "feat: turn customer detail into a progression center"
```

---

## Task 18：导航、AI 抽屉与确认卡

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/ChatStream.tsx`
- Modify: `apps/web/src/components/AiDrawer.tsx`
- Modify: `apps/web/src/components/ConfirmationCard.tsx`
- Modify: `apps/web/src/components/ArtifactCard.tsx`

- [ ] **Step 1：导航加入商机**

在 `AppShell.tsx` 导入 `Target`，并在 `BASE_NAV` 的“客户”之后加：

```ts
{ to: "/opportunities", label: "商机", icon: Target, testId: "nav-opportunities" },
```

- [ ] **Step 2：ArtifactCard 支持新类型**

把 `ArtifactCard.tsx` 改为：

```tsx
import type { Artifact } from "@salespilot/shared";
import { formatMoney } from "../lib/utils";
import { ConfirmationCard } from "./ConfirmationCard";

export function ArtifactCard({ artifact, onCommitted }: { artifact: Artifact; onCommitted: (result: any) => void }) {
  const confirmable = artifact.confirmationToken && ["quote", "follow_up", "next_action"].includes(artifact.kind);
  if (confirmable) return <ConfirmationCard artifact={artifact} onCommitted={onCommitted} />;
  const payload = artifact.payload as any;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">{artifact.title}</div>
      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">{JSON.stringify(payload, null, 2)}</pre>
      {payload?.preview?.totalCents ? <div className="mt-2 text-xs">合计 {formatMoney(payload.preview.totalCents)}</div> : null}
    </div>
  );
}
```

- [ ] **Step 3：ConfirmationCard 支持跟进/下一步**

在 `ConfirmationCard.tsx` 顶部：

```tsx
const isFollowUp = artifact.toolName === "log_follow_up";
const isNextAction = artifact.toolName === "update_opportunity_next_action";
const FOLLOW_UP_LABELS: Record<string, string> = {
  call: "电话",
  wechat: "微信",
  email: "邮件",
  meeting: "会议",
  quote: "报价",
  system: "系统动作",
  ai_suggestion: "AI 建议",
};
```

把 `confirmLabel` 改为：

```tsx
const confirmLabel = isConvert ? "确认提交" : isFollowUp ? "确认记录" : isNextAction ? "确认更新" : "确认生成";
```

在金额展示处，如果是跟进/下一步，不显示 `formatMoney(total)`：

```tsx
{!isFollowUp && !isNextAction ? (
  <div className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(total)}</div>
) : null}
```

在 `isConvert ? ... : null` 之后加：

```tsx
{isFollowUp ? (
  <div className="mb-2 space-y-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
    <div className="flex justify-between"><span>跟进方式</span><span className="font-medium">{FOLLOW_UP_LABELS[preview.type] ?? preview.type}</span></div>
    <div>内容：{preview.content}</div>
    {preview.result ? <div>结果：{preview.result}</div> : null}
    {preview.nextAction ? <div>下一步：{preview.nextAction}</div> : null}
  </div>
) : null}

{isNextAction ? (
  <div className="mb-2 space-y-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
    <div>商机：{preview.name ?? preview.opportunityId}</div>
    <div>下一步：{preview.nextAction}</div>
  </div>
) : null}
```

- [ ] **Step 4：ChatStream 处理跟进提交结果**

把 `onCommitted` 替换为：

```ts
function onCommitted(result: any) {
  const status = result?.data?.status;
  if (status === "committed") {
    const message = result.data.followUp
      ? "跟进已记录。"
      : result.data.nextAction
        ? "下一步已更新。"
        : result.data.ticket
          ? "工单已创建。"
          : result.data.order
            ? "订单已创建。"
            : "报价已生成。";
    addMessage({ role: "assistant", content: message });
    if (result.data.quote?.id) setLastQuoteId(result.data.quote.id);
    bumpData();
  }
  if (result?.data?.approvalId) setPendingApproval(result.data.approvalId);
  if (status === "pending_approval" && result.data.approvalId) {
    addMessage({ role: "assistant", content: "信用不足，已提交经理审批。" });
    bumpData();
  }
}
```

- [ ] **Step 5：AI 抽屉快捷问题**

在 `ChatStream.tsx` 的空状态块中追加：

```tsx
<div className="mt-3 flex flex-wrap gap-1.5">
  {["今天哪些客户最值得跟进", "帮我推进华辰设计", "记录一条跟进"].map((prompt) => (
    <button
      key={prompt}
      type="button"
      onClick={() => void send(prompt)}
      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
    >
      {prompt}
    </button>
  ))}
</div>
```

- [ ] **Step 6：类型检查**

Run: `pnpm --filter @salespilot/web typecheck`
Expected: PASS。

- [ ] **Step 7：提交**

```bash
git add apps/web/src/components/AppShell.tsx apps/web/src/components/ArtifactCard.tsx apps/web/src/components/ConfirmationCard.tsx apps/web/src/components/ChatStream.tsx
git commit -m "feat: wire war room navigation and AI actions"
```

---

## Task 19：运行 E2E 并修复

- [ ] **Step 1：运行新 E2E**

Run: `pnpm test:e2e -- --grep "war room|manager sees|AI promotes"`
Expected: 3 条通过。

- [ ] **Step 2：运行全部 E2E**

Run: `pnpm test:e2e`
Expected: 现有 4 条 + 新增 3 条全部通过。

- [ ] **Step 3：修复常见问题**

- 如果 `priority-card` 找不到：确认 Dashboard 使用了 `PriorityCard`，且 `data-testid="priority-card"` 在 `<article>` 上。
- 如果客户页找不到“客户推进中心”：确认 PageHeader 标题里有该文本。
- 如果记录跟进后列表未刷新：确认 `onSaved={refetch}` 且 `bumpData()` 被调用。
- 如果 AI 推进无响应：确认 MockProvider 的“推进”分支在“报价”分支之前，且 `get_opportunity_detail` 工具已注册。
- 如果经理页没有“销售排行”：确认种子数据包含 4 个用户，且 `buildWorkspace` 对经理返回 `ranking`。

- [ ] **Step 4：提交修复**

```bash
git add -A
git commit -m "test: make war room e2e pass"
```

---

# Phase 5：验证与文档

## Task 20：全量验证

- [ ] **Step 1：运行类型检查**

Run: `pnpm typecheck`
Expected: 0 errors。

- [ ] **Step 2：运行单元与集成测试**

Run: `pnpm test`
Expected: shared + server 全部通过；新增测试数量大于 90。

- [ ] **Step 3：运行评测**

Run: `pnpm eval`
Expected: 30 条用例，通过率 100%。

- [ ] **Step 4：运行构建**

Run: `pnpm build`
Expected: shared / server / web 均构建成功。

- [ ] **Step 5：运行 E2E**

Run: `pnpm test:e2e`
Expected: 7 条全部通过。

- [ ] **Step 6：修复并提交**

如果任何一步失败，修复后重新运行；全部通过后：

```bash
git add -A
git commit -m "chore: verify war room build and tests"
```

---

## Task 21：人工视觉验收

- [ ] **Step 1：启动开发服务**

Run: `pnpm dev`
Expected: server 3000、web 5173 启动。

- [ ] **Step 2：写截图脚本**

创建 `_temp/screenshot-war-room.mjs`：

```js
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "_temp/screenshots";
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const base = "http://127.0.0.1:5173";

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await desktop.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
await desktop.screenshot({ path: `${outDir}/dashboard-sales.png`, fullPage: true });

await desktop.getByRole("combobox", { name: "切换角色" }).selectOption("u_manager_wang");
await desktop.waitForTimeout(1000);
await desktop.screenshot({ path: `${outDir}/dashboard-manager.png`, fullPage: true });

await desktop.goto(`${base}/opportunities`, { waitUntil: "networkidle" });
await desktop.screenshot({ path: `${outDir}/opportunities.png`, fullPage: true });

await desktop.goto(`${base}/customers/c_huachen`, { waitUntil: "networkidle" });
await desktop.screenshot({ path: `${outDir}/customer-detail.png`, fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
await mobile.screenshot({ path: `${outDir}/dashboard-mobile.png`, fullPage: true });
await mobile.goto(`${base}/customers/c_huachen`, { waitUntil: "networkidle" });
await mobile.screenshot({ path: `${outDir}/customer-mobile.png`, fullPage: true });

await browser.close();
console.log(`screenshots written to ${outDir}`);
```

如果 `chromium.launch()` 报找不到浏览器，改为：

```js
const browser = await chromium.launch({
  executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1248/chrome-win64/chrome.exe`,
});
```

- [ ] **Step 3：运行截图并人眼检查**

Run: `node _temp/screenshot-war-room.mjs`
Expected: `_temp/screenshots/` 下生成 6 张图。

逐张检查：

- 首屏是否在没有打开聊天的情况下就能看到“今天推进谁、为什么、下一步”；
- P0/P1/P2 颜色是否区分；
- 金额、客户、商机、建议是否对齐；
- 经理视图是否有团队指标、风险商机、销售排行、待审批；
- 手机视口指标条是否两列换行、按钮是否可点、是否没有横向滚动；
- 是否有任何文字溢出、卡片挤压、按钮换行错乱。

- [ ] **Step 4：修复视觉问题**

按截图调整 Tailwind 类；不要只依赖几何断言。

- [ ] **Step 5：提交**

```bash
git add -A
git commit -m "style: polish war room responsive layout"
```

---

## Task 22：更新文档

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEMO_SCRIPT.md`

- [ ] **Step 1：README**

更新“核心能力”表格，增加：

```markdown
| 销售作战室 | 今日优先级、待办、风险商机、经理驾驶舱 |
| 商机与跟进 | 一客户多商机、下一步行动、跟进时间线 |
| AI 主动推进 | `get_sales_priorities` / `get_opportunity_detail` / `log_follow_up` / `update_opportunity_next_action` |
```

把目录结构中的工具数量从 9 改为 13，并补充 `domain/workspace.ts` 与 `domain/priority.ts`。

- [ ] **Step 2：ARCHITECTURE**

在“Agent 流程”后增加“作战室数据流”：

```text
opportunities + followUps + quotes + orders + inventory + credit
        ↓
domain/priority.ts（金额 × 概率 × 紧迫度 × 风险）
        ↓
domain/workspace.ts（self / team 聚合）
        ↓
/api/business/workspace ──→ 前端作战室
        └──→ get_sales_priorities / get_opportunity_detail（AI 工具）
```

在“数据模型”中补充 `opportunities`、`follow_ups`、`quotes.opportunityId`、`orders.opportunityId`、`users.monthlyTargetCents`。

在“API 一览”中补充新接口。

- [ ] **Step 3：DEMO_SCRIPT**

把开场改为“打开作战室”，按以下动线重写 5 分钟脚本：

1. 作战室首屏：P0 华辰设计服务器采购，说明金额、5 天未跟进、信用 92%、SRV 库存不足；
2. 点“让 AI 帮我推进”，展示工具调用与建议；
3. 点“记录跟进”，确认后时间线更新；
4. 切经理，展示团队指标、高风险商机、销售排行、待审批；
5. 经理问“本月哪些单最危险”，展示团队风险摘要；
6. 收尾：执行详情与 trace 可回放。

- [ ] **Step 4：提交**

```bash
git add README.md docs/ARCHITECTURE.md docs/DEMO_SCRIPT.md
git commit -m "docs: update war room capabilities and demo flow"
```

---

## Task 23：最终检查与提交

- [ ] **Step 1：查看 diff**

Run: `git status --short && git diff --stat`
Expected: 只包含本次重构相关文件。

- [ ] **Step 2：运行最终验证**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm eval
pnpm test:e2e
```

Expected: 全部通过。

- [ ] **Step 3：确认没有泄露或占位符**

Run: `git diff --check`
Expected: 无空白错误。

检查新增文件中没有 `TODO`、`TBD`、`FIXME`、占位 URL、真实密钥。

- [ ] **Step 4：最终提交**

```bash
git add -A
git commit -m "feat: ship AI sales war room"
```

---

## 自检清单（实现完成后逐项确认）

- [ ] 首屏不需要打开聊天就能看到 3–5 条“对象 / 原因 / 建议动作”。
- [ ] 每个进行中商机都有下一步与截止时间。
- [ ] 一个客户可以有多个商机，客户页能看到当前商机与跟进时间线。
- [ ] AI 能执行“帮我推进华辰设计”，工具链在 trace 中可见。
- [ ] AI 写操作必须预览 → 确认 → 提交，不能绕过。
- [ ] 销售只能看自己，经理能看团队；所有新接口与工具都有测试。
- [ ] 报价/订单与商机显式关联，转订单后商机阶段变为成交。
- [ ] 经理驾驶舱有团队销售额、目标完成率、预计成交、高风险商机、待审批、销售排行。
- [ ] Mock 模式完整可演示；DeepSeek 模式首屏不被模型阻塞。
- [ ] `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm eval`、`pnpm test:e2e` 全部通过。
- [ ] 桌面与 390×844 手机视口截图人眼验收通过。
