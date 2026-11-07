# SalesPilot AI 销售作战室设计

- 日期：2026-11-07
- 状态：设计已确认，待实现
- 适用范围：腾讯 AI Coding 课程作业 · 方向二 · 场景 3
- 本文是产品级重构规格，不替代现有 `docs/ARCHITECTURE.md`；实现完成后需同步更新架构、演示脚本与 README。

## 1. 背景与目标

当前 SalesPilot 已经具备完整的“销售问 AI → AI 调工具 → 返回结果”能力：9 个业务工具、LangGraph 状态图、SSE 执行链、写操作确认令牌、幂等、审批、RAG、权限与 90 个测试。问题不在能力缺失，而在**产品入口和信息架构**：用户必须先打开对话、提出正确的问题，AI 才会工作。

本次重构把产品升级为：

> **AI 销售作战室：AI 主动判断今天该推进谁、为什么推进、下一步怎么推进，并直接执行相关业务操作。**

第一屏不是聊天框，而是“今天应该做什么”。聊天保留为按需入口，执行链保留为可展开的 AI 工作过程。

### 成功标准

1. 销售打开首页即可看到 3–5 条带“对象 / 原因 / 建议动作”的今日建议，不需要先提问。
2. 每个进行中的商机都有明确的下一步、负责人和截止时间。
3. 客户详情从“资料展示”变为“客户推进中心”，包含商机、跟进、风险与 AI 判断。
4. AI 支持“帮我推进华辰设计”，自动读取客户/商机/库存/价格并给出下一步与可执行选项。
5. 经理可看到团队指标、风险商机、销售排行与待审批，并能用 AI 查询团队风险。
6. 现有 9 个工具、写操作安全链、审批、价格底线、信用额度、数据范围全部保持有效。
7. Mock 模式完整可演示；DeepSeek 模式可用于增强解读，但不阻塞首屏。

## 2. 非目标

- 不重写后端、不替换 LangGraph、不删除工具调用与 trace。
- 不做复杂 BI、完整企业 CRM、真实 ERP/支付/物流、多组织 SaaS。
- 不新增复杂权限系统；沿用现有角色、团队与客户归属规则。
- 不为“看起来 AI 很强”堆砌聊天功能；AI 必须围绕业务动作。

## 3. 现有能力与复用边界

| 能力 | 现有落点 | 本次处理 |
|---|---|---|
| 9 个业务工具 | `apps/server/src/tools/*` | 保留，新增 5 个工具（4 个业务工具 + 1 个动作建议工具），扩展 1 个读工具 |
| LangGraph 执行链 | `apps/server/src/agent/graph.ts` | 保留，仅更新 Prompt 与 Mock 脚本 |
| SSE / trace / 审计 | `routes/chat.ts`、`agent/trace.ts` | 保留，首页不展示，抽屉内展开 |
| 写操作安全 | `domain/confirmation.ts`、`idempotency.ts` | 新写工具复用同一模式 |
| 报价/转单/审批 | `createQuote.ts`、`convertQuoteToOrder.ts`、`approvals.ts` | 保留，仅补商机关联与阶段同步 |
| 权限与数据范围 | `lib/actor.ts`、`domain/permissions.ts` | 保留，所有新接口复用 |
| 前端工作台 | `pages/Dashboard.tsx`、`CustomerDetail.tsx` | 重构信息架构，保留组件体系 |
| AI 抽屉 | `components/AiDrawer.tsx`、`ChatStream.tsx` | 保留，增加上下文与快捷问题 |

## 4. 产品信息架构

主导航：

```text
作战室 / 商机 / 客户 / 库存 / 报价 / 订单 / 售后 / 审批（经理） / 审计
```

右上角保留：角色切换、AI 助手、重置演示。

- `/dashboard`：今日作战室；经理角色自动切换为团队驾驶舱。
- `/opportunities`：商机列表。
- `/opportunities/:id`：商机详情与推进动作。
- `/customers/:id`：客户推进中心。
- AI 助手：右侧抽屉，由业务页面按需打开并预填上下文。
- 执行详情：抽屉内“查看执行详情”，或审计页回放。

## 5. 数据模型

### 5.1 新增 `opportunities`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | 商机 ID |
| `customerId` | text | 所属客户 |
| `ownerId` | text | 负责人 |
| `name` | text | 商机名称 |
| `amountCents` | integer | 金额，分 |
| `stage` | text | `lead / needs / solution / quote / negotiation / won / lost` |
| `probability` | integer | 0–100 |
| `expectedCloseDate` | integer | 预计成交日，毫秒时间戳 |
| `nextAction` | text nullable | 下一步动作 |
| `nextActionDueAt` | integer nullable | 下一步截止时间 |
| `riskLevel` | text | `low / medium / high`，默认 `low` |
| `lastFollowUpAt` | integer nullable | 最近跟进时间，写入跟进时同步 |
| `createdAt` / `updatedAt` | integer | 时间戳 |

索引：`(customerId)`、`(ownerId, stage)`、`(nextActionDueAt)`。

### 5.2 新增 `follow_ups`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | 跟进 ID |
| `customerId` | text | 客户 |
| `opportunityId` | text nullable | 关联商机 |
| `actorId` | text | 执行人 |
| `type` | text | `call / wechat / email / meeting / quote / system / ai_suggestion` |
| `content` | text | 跟进内容 |
| `result` | text nullable | 结果 |
| `nextAction` | text nullable | 约定的下一步 |
| `nextActionDueAt` | integer nullable | 下一步截止 |
| `createdAt` | integer | 时间戳 |

索引：`(customerId, createdAt)`、`(opportunityId, createdAt)`。

### 5.3 现有表最小改动

- `quotes.opportunityId`：可空，新建报价时可选传入。
- `orders.opportunityId`：可空，由报价继承。
- `users.monthlyTargetCents`：整数，默认 `0`；销售目标与团队目标由此汇总。

迁移为纯增量，不修改既有列类型，不删除数据。SQLite 新列可空或有默认值，可安全应用到现有库。

### 5.4 业务联动

- `create_quote` 接受可选 `opportunityId`；校验商机属于该客户；提交成功后设置 `quotes.opportunityId`，商机阶段推进到 `quote`。
- `convert_quote_to_order` 创建订单时写入 `orders.opportunityId = quotes.opportunityId`；订单创建成功后商机阶段推进到 `won`，概率置 100，清空下一步。
- 审批通过后创建订单的路径同样继承商机并更新阶段。
- 记录跟进时更新商机 `lastFollowUpAt`；若填写 `nextAction`，同步商机下一步与截止时间。

## 6. 优先级引擎

纯函数位于 `apps/server/src/domain/priority.ts`，不依赖数据库，便于单元测试，前端与 AI 工具共用同一输出。

### 6.1 输入

- 商机金额、成交概率、阶段、风险等级；
- 最近跟进时间、下一步截止时间；
- 风险信号：信用使用率、关联报价到期、关联 SKU 库存、金额规模；
- 当前时间（显式传入，测试可控）。

### 6.2 公式

```text
amountNorm = min(amountCents / 30_000_000, 1)          # 30 万元封顶
probNorm   = probability / 100
idleDays   = (now - (lastFollowUpAt ?? createdAt)) / 86400000
overdueDays = max(0, (now - nextActionDueAt) / 86400000)
dueSoon    = nextActionDueAt 在今天内且未逾期 ? 0.3 : 0
urgency    = clamp(max(idleDays / 7, overdueDays / 2, dueSoon), 0, 1)
riskFactor = { high: 1.0, medium: 0.7, low: 0.4 }
score = round(100 × (0.40×amountNorm + 0.25×probNorm + 0.20×urgency + 0.15×riskFactor))
```

分级：

```text
P0：score ≥ 60，今天必须处理
P1：score ≥ 40，今天建议处理
P2：其余，本周处理
```

有效风险取“存储风险等级”和“信号推导风险”的较高值；信号包括信用使用率 ≥ 80%、报价 48 小时内到期、报价 SKU 可用库存低于安全库存。

信号口径：

- 报价到期：优先取该商机关联报价；无关联报价时，仅回退到未绑定其他商机的 `approved` 报价，避免跨商机信号污染。
- 库存不足：优先取该商机关联报价的明细 SKU；无关联报价时，取该客户未结报价的明细 SKU。
- 客户刚回复：最近 24 小时内有跟进记录且 `result` 非空。
- 金额规模：用于 `amountNorm`，不单独列为风险。

### 6.3 输出

```ts
interface PriorityItem {
  opportunityId: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  amountCents: number;
  stage: OpportunityStage;
  probability: number;
  riskLevel: "low" | "medium" | "high";
  priority: "P0" | "P1" | "P2";
  score: number;
  reasons: string[];
  suggestedAction: string;
  nextAction: string | null;
  nextActionDueAt: number | null;
  lastFollowUpAt: number | null;
  signals: {
    creditUtilization: number | null;
    quoteExpiringAt: number | null;
    stockShortage: boolean;
    recentCustomerReply: boolean;
    idleDays: number;
    overdueDays: number;
  };
}
```

原因必须来自真实数据，最多展示 4 条；建议动作按以下优先级合成，最多 2 条：

1. 库存不足 + 报价阶段：先确认客户预算与交付时间，再决定备货/调拨；
2. 信用风险：确认回款或申请信用审批；
3. 报价即将到期：今天联系客户确认报价，必要时重新出价；
4. 下一步逾期/长期未跟进：今天电话联系客户确认下一步；
5. 客户刚回复：发送下一版方案/报价；
6. 其他按阶段给出默认动作。

## 7. 后端服务与 API

### 7.1 模块边界

新增：

```text
apps/server/src/domain/priority.ts      # 纯评分与建议
apps/server/src/domain/workspace.ts     # 按角色聚合指标、优先级、待办、风险、排行
apps/server/src/domain/followUps.ts     # 跟进写入与商机同步
apps/server/src/routes/workspace.ts     # 作战室与商机 HTTP
apps/server/src/routes/followUps.ts     # 跟进 HTTP
apps/server/src/tools/read/getSalesPriorities.ts
apps/server/src/tools/read/getOpportunityDetail.ts
apps/server/src/tools/write/logFollowUp.ts
apps/server/src/tools/write/updateOpportunityNextAction.ts
```

不把新逻辑继续堆进 1053 行的 `routes/business.ts`。

### 7.2 接口

```text
GET   /api/business/workspace
GET   /api/business/opportunities?stage=&risk=&customerId=&ownerId=
GET   /api/business/opportunities/:id
PATCH /api/business/opportunities/:id
POST  /api/business/follow-ups
```

`GET /api/business/workspace` 返回：

```ts
{
  scope: "self" | "team";
  actor: { id, name, role, teamId };
  metrics: {
    monthSalesCents; monthTargetCents; completionRate;
    expectedCloseCents; activeOpportunities; highRiskOpportunities;
    pendingApprovals; todayFollowUps; overdueFollowUps;
  };
  headline: string;                 // 规则生成的今日判断
  priorities: PriorityItem[];       // 3–5 条
  todos: {
    today: TodoItem[];
    overdue: TodoItem[];
    approvals: TodoItem[];
    quotesToAdvance: TodoItem[];
    quotesExpiring: TodoItem[];
    tickets: TodoItem[];
  };
  risks: PriorityItem[];
  ranking?: Array<{
    ownerId; ownerName; monthSalesCents; pipelineCents;
    targetCents; completionRate; trend: "up" | "flat" | "down";
  }>;
  recentQuotes: QuoteRow[];
  recentOrders: OrderRow[];
  alerts: AlertRow[];
}
```

`TodoItem`：

```ts
{
  id; kind; title; subtitle;
  customerId?; opportunityId?;
  amountCents?; dueAt?;
  severity: "info" | "warning" | "blocker";
  href: string;
}
```

指标口径：

- `monthSalesCents`：本自然月内创建、状态为 `reserved` 或 `fulfilled` 的订单金额之和。
- `monthTargetCents`：销售取 `users.monthlyTargetCents`；经理取团队成员目标之和。
- `completionRate`：`monthSalesCents / monthTargetCents`，目标为 0 时为 0。
- `expectedCloseCents`：进行中商机的 `amountCents × probability / 100` 之和。
- `activeOpportunities`：阶段不属于 `won / lost` 的商机数。
- `highRiskOpportunities`：有效风险为 `high` 的进行中商机数。
- `pendingApprovals`：经理为团队 `pending` 审批数；销售为自己发起的 `pending` 审批数。
- `todayFollowUps`：`nextActionDueAt` 落在今天的进行中商机数。
- `overdueFollowUps`：`nextActionDueAt` 早于今天且未处理的进行中商机数。

待办口径：

- `today` / `overdue`：按商机 `nextActionDueAt` 划分，点击进入商机或客户。
- `approvals`：`pending` 审批，经理可进入审批页；销售只读。
- `quotesToAdvance`：状态为 `approved`、未转订单、且创建超过 2 天的报价。
- `quotesExpiring`：`approved` 且 48 小时内到期的报价。
- `tickets`：`open / processing` 售后工单。

排行口径：

- `monthSalesCents` 同上；
- `pipelineCents`：该销售进行中商机的预计成交额；
- `targetCents`：该销售月度目标；
- `trend`：完成率 ≥ 80% 为 `up`，≥ 50% 为 `flat`，其余为 `down`；仅用于演示趋势，不代表历史环比。

`headline` 示例：

```text
今天有 3 个商机值得优先推进：华辰设计服务器采购存在流失风险，远山制造客户刚回复，星河零售需要确认需求。
```

`GET /api/business/dashboard` 保留现有字段与行为，内部复用 workspace 的指标计算，避免旧调用与测试失效。

扩展 `GET /api/business/customers/:id`：

```ts
{
  ...现有字段,
  opportunities: OpportunityView[];
  followUps: FollowUpRow[];
  assessment: {
    summary: string;
    positiveSignals: string[];
    risks: string[];
    suggestion: string;
    nextAction: string | null;
  };
}
```

### 7.3 写接口语义

- `PATCH /api/business/opportunities/:id`：用户主动修改 `stage / probability / riskLevel / nextAction / nextActionDueAt / amountCents / expectedCloseDate`；校验枚举与归属；更新 `updatedAt`。销售只能改自己客户，经理可改团队。
- `POST /api/business/follow-ups`：用户主动记录跟进；写入 `follow_ups` 并同步商机；校验客户/商机归属。用户表单允许 `call / wechat / email / meeting / quote / system`；`ai_suggestion` 仅供 AI 工具写入。
- 这两个接口是普通表单写操作，不需要确认令牌；AI 发起的写操作走工具确认链。
- `quotes.opportunityId` 必须属于同一客户；写入后不可跨客户转移。

## 8. AI 工具链

### 8.1 新增读工具

**`get_sales_priorities`**

```ts
{ scope: "self" | "team"; limit?: 1–10; focus?: "all" | "risk" | "follow_up" }
```

返回优先级、待办摘要、关键指标。`team` 仅经理可用，销售请求团队范围返回 `FORBIDDEN`。

**`get_opportunity_detail`**

```ts
{ opportunityId: string }
```

返回商机、客户、联系人、关联报价/订单、最近跟进、风险信号、建议下一步。销售只能读自己客户。

**`suggest_actions`（UI 动作工具）**

```ts
{ actions: Array<{ label: string; prompt: string }> } // 1–4 个
```

返回 `actions` artifact，前端渲染为可点击按钮；无业务副作用。用于把 AI 的“可继续执行选项”从正文文本变成结构化 UI。

### 8.2 扩展读工具

`get_customer_360` 增加 `opportunities` 与 `followUps`，保持原有字段不变。

### 8.3 新增写工具

**`log_follow_up`**

```ts
{
  customerId; opportunityId?; type;
  content; result?;
  nextAction?; nextActionDueAt?;
  dryRun; confirmationToken?; idempotencyKey?
}
```

dry-run 返回预览与确认令牌；提交写入跟进并同步商机。`type` 限定为 `call / wechat / email / meeting / quote / system / ai_suggestion`。

**`update_opportunity_next_action`**

```ts
{
  opportunityId; nextAction; nextActionDueAt?;
  dryRun; confirmationToken?; idempotencyKey?
}
```

dry-run 返回预览与令牌；提交更新商机下一步。

两个写工具都复用 `issueConfirmationToken` / `consumeConfirmationToken` / `withIdempotency`，并写入审计日志。`ConfirmRequest.toolName` 的枚举需扩展到 5 个写工具。

### 8.4 Prompt 与 Mock

系统提示增加：

- 用户说“推进某客户/某商机”时，先取商机详情与客户 360，再按需查库存、价格、信用；
- 输出结构：结论 → 关键发现（最多 3 条）→ 建议动作 → 可继续执行的选项（最多 4 个）；
- 不编造数据；不绕过确认、审批、价格底线与数据范围；
- 经理问“团队/本月”时使用 `scope=team`。

Mock Provider 新增确定性脚本：

| 用户输入关键词 | 工具序列 | 最终文本 |
|---|---|---|
| 推进 / 帮我推进 / 怎么推进 | `get_opportunity_detail` → `check_inventory` | 发现 + 建议 + 选项 |
| 今天最值得跟进 / 优先级 / 哪些单最危险 | `get_sales_priorities` | 今日优先级摘要 |
| 记录跟进 / 记一条跟进 | `log_follow_up`（dryRun） | 跟进预览 |
| 下一步 / 接受建议 | `update_opportunity_next_action`（dryRun） | 下一步预览 |

客户关键词映射到固定演示 ID：华辰 → `c_huachen` / `o_huachen_server`；远山 → `c_yuanshan` / `o_yuanshan_storage`；其他默认华辰。

新增评测用例：

| 输入 | 期望工具 |
|---|---|
| 帮我推进华辰设计 | `get_opportunity_detail`、`check_inventory` |
| 今天哪些客户最值得跟进 | `get_sales_priorities` |
| 本月哪些单最危险 | `get_sales_priorities` |
| 记录跟进：已联系华辰采购，预算本周确认 | `log_follow_up` |
| 把华辰服务器的下一步改成周五确认预算 | `update_opportunity_next_action` |

## 9. 前端设计

### 9.1 作战室 `/dashboard`

自上而下：

1. 标题区：日期、问候、角色范围说明；
2. 指标条：本月销售额、本月目标/完成率、预计成交、进行中商机、高风险商机；
3. AI 今日建议：3–5 张 `PriorityCard`，含 P0/P1/P2、客户、商机、金额、阶段、风险、原因、建议动作；
4. 操作按钮：`查看客户`、`查看商机`、`让 AI 帮我推进`、`记录跟进`；
5. 我的待办与风险商机：今日跟进、逾期跟进、待审批、待报价、报价到期、售后；
6. 底部：最近报价/订单，保持紧凑，不做复杂 BI。

经理角色：

- 指标切换为团队范围；
- 增加“高风险商机表”“销售排行”“待审批”；
- 排行展示本月销售额、管道金额、目标完成率与趋势。

### 9.2 商机页

- `/opportunities`：按阶段、风险、负责人筛选；桌面表格、移动端卡片；
- `/opportunities/:id`：商机头部、AI 判断、下一步卡、风险信号、关联报价/订单、跟进时间线、操作按钮。

### 9.3 客户推进中心 `/customers/:id`

- 头部动作：`新建报价`、`记录跟进`、`让 AI 帮我推进`；
- 当前商机卡片：金额、阶段、概率、下一步、截止时间；
- AI 客户判断：摘要、积极信号、风险、建议；
- 跟进时间线；
- 保留信用、联系人、报价、订单、售后。

### 9.4 通用组件

- `PriorityCard`
- `TodoPanel`
- `AIAssessmentCard`
- `FollowUpModal`
- `OpportunityStageBadge`
- 扩展 `ArtifactKind`：新增 `follow_up`、`next_action`；确认卡按 `toolName` 渲染跟进/下一步预览。
- 扩展确认卡以支持 `log_follow_up` / `update_opportunity_next_action`。

### 9.5 AI 抽屉

- 保留现有对话、artifact、确认卡、执行详情；
- 空状态增加快捷问题：今日最值得跟进、帮我推进华辰设计、本月风险商机、记录一条跟进；
- 从优先级卡进入时设置上下文并预填提示词；
- “让 AI 解读”通过预填提示词打开抽屉，不新增阻塞首屏的模型调用。

## 10. 权限与写操作安全

- 所有新查询按 `scopedOwnerIds` 过滤；销售仅自己，经理团队；
- 商机、跟进、客户详情写操作校验客户归属；
- 新工具在 `executeTool` 层校验角色与客户权限；
- AI 不能直接修改价格、信用、审批状态；
- 新写工具只涉及跟进与下一步等非交易字段；
- 现有报价/转单/审批链保持“预览 → 确认令牌 → 提交 → 幂等”；
- AI 发起的写操作返回 `pending_confirmation` 与 artifact，前端确认后才提交。

## 11. Demo 数据

沿用现有客户名，新增 2 名销售，保证经理视图有真实排行。

### 11.1 用户与目标

- 小林（销售）：月度目标 ¥1,500,000；
- 老王（经理）：团队目标由成员目标汇总；
- 小王（销售）：月度目标 ¥800,000；
- 小陈（销售）：月度目标 ¥600,000。

### 11.2 核心商机

| 优先级 | 客户 | 商机 | 金额 | 阶段 | 概率 | 风险 | 关键信号 |
|---|---|---|---|---|---|---|---|
| P0 | 华辰设计 | 服务器采购 | ¥280,000 | 报价 | 70% | 高 | 5 天未跟进、信用 92%、X1 上海仓缺货、下一步今天到期 |
| P1 | 远山制造 | 存储扩容 | ¥120,000 | 谈判 | 65% | 低 | 客户刚回复、下一步发送最终报价 |
| P2 | 星河零售 | 年度维保 | ¥60,000 | 需求确认 | 30% | 低 | 下周跟进 |
| P1 | 海川物流 | 移动工作站 | ¥150,000 | 需求确认 | 25% | 高 | 信用风险 |
| P2 | 凌云科技 | 笔记本采购 | ¥100,000 | 谈判 | 60% | 中 | 关联报价即将到期 |

华辰设计另有“存储扩容 ¥120,000”商机，用于演示一客户多商机。

### 11.3 团队商机与排行

- 小王：智航电子 ¥220,000（报价、高风险、6 天未跟进）、开源材料 ¥90,000；
- 小陈：海通能源 ¥180,000、远途物流 ¥70,000；
- 新增 2 笔团队订单，保证销售排行有区分度。

### 11.4 待办与风险

- 1 条待审批（信用不足）；
- 1 张 48 小时内到期报价；
- 1 条未结售后工单；
- 1 条今日跟进、1 条逾期跟进。

### 11.5 演示动线

1. 打开作战室，看到 P0 华辰设计与原因；
2. 点“让 AI 帮我推进”，AI 依次读取商机、库存并给出建议与选项；
3. 点“记录跟进”，填写结果与下一步，确认后时间线更新；
4. 切到经理，看到团队指标、高风险商机、销售排行、待审批；
5. 经理问“本月哪些单最危险”，AI 返回团队风险摘要。

## 12. 测试与验收

### 12.1 自动化

- `pnpm test`：现有 90 个测试全绿，新增：
  - 优先级评分边界与 P0/P1/P2；
  - 原因与建议动作；
  - workspace 销售/经理范围；
  - 商机列表/详情/PATCH；
  - 跟进写入与商机同步；
  - 报价/订单商机关联与阶段推进；
  - 新工具 dry-run/commit/幂等/越权；
  - Mock 主动推进脚本。
- `pnpm typecheck`、`pnpm build` 通过。
- `pnpm test:e2e`：现有 4 条全绿，新增：
  - 作战室展示 P0 与原因；
  - 客户推进中心展示商机与跟进；
  - 记录跟进后时间线更新；
  - 经理视图展示团队风险与排行。
- `pnpm eval`：新增 3–5 条主动推进用例，通过率保持 100%，更新 `docs/EVAL_REPORT.md`。

### 12.2 人工验收

- Mock 模式完整走通演示动线；
- DeepSeek 模式首屏不被模型阻塞，AI 解读与推进可用；
- 桌面 1440px 与手机 390×844 截图检查；
- 销售无法读取他人客户/商机；经理可见团队；
- AI 写操作必须经过预览与确认。

## 13. 实施阶段

1. **数据层**：Schema、迁移、seed、demo reset、优先级纯函数与测试。
2. **业务层**：workspace/opportunity/follow-up 服务与 API、客户详情扩展、报价/订单商机关联。
3. **AI 层**：5 个新工具（含动作建议）、Prompt、Mock、评测用例。
4. **前端**：作战室 → 商机页 → 客户推进中心 → 确认卡/跟进弹窗 → 经理视图。
5. **验证与文档**：测试、E2E、截图、README/ARCHITECTURE/DEMO_SCRIPT 更新。

## 14. 风险与回滚

| 风险 | 处理 |
|---|---|
| 新增 seed 用户/订单导致现有数量断言失败 | 有意更新 seed 测试，保持数据链一致 |
| 现有 dev 库未自动 seed 新数据 | 迁移后执行 `pnpm db:seed`；演示前重置 |
| `business.ts` 继续膨胀 | 新逻辑放独立路由与域模块 |
| Mock 中文关键词误匹配 | 关键词映射固定演示 ID，并补测试 |
| 首页信息过载 | 分区、限 3–5 条优先级、移动端卡片化 |
| AI 调用慢/失败 | 首屏规则渲染；AI 解读按需触发并回退模板 |
| 迁移影响旧数据 | 仅新增表与可空列；不删除、不改类型 |

回滚：新表与新路由可删除；`quotes/orders` 新列可空，不影响旧逻辑；`users.monthlyTargetCents` 有默认值。

## 15. 已确认决策

- 交付范围：完整落地销售作战室、商机、跟进、经理驾驶舱与 AI 主动链。
- Demo 客户名称：沿用现有名称（华辰设计、远山制造、星河零售等）。
- AI 今日建议：规则事实 + LLM 可选润色；Mock 模式确定性模板。
- 商机关联：`quotes/orders` 显式增加可空 `opportunityId`。
