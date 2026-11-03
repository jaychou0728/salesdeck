# SalesPilot 销售作战室 — 设计文档

- 日期：2026-11-03
- 状态：已确认，进入实施计划
- 场景：腾讯 AI Coding 课程作业 · 方向二 · 场景 3「业务智能体（销售 / CRM / 进销存自动化）」
- 交付节点：2026-11-10 汇报演示

---

## 1. 背景与约束

### 1.1 作业硬性要求

| # | 要求 | 本设计的落点 |
|---|---|---|
| 1 | 网关支持 tool / function 调用透传与结果回传（OpenAI 兼容格式） | `POST /v1/chat/completions` 完整支持 `tools`、`tool_choice`、`role:tool`、流式 `tool_calls` 增量 |
| 2 | 业务工具健壮：参数校验、异常处理、幂等 / 边界处理 | Zod 校验 + 业务规则 + 统一错误码 + 幂等键 + 确认令牌 + 乐观锁 + 事务 |
| 3 | 前端展示「思考 → 调用 → 结果」执行链路，体现可解释性 | SSE 事件驱动的时间线 + 业务卡片 + 证据引用 + trace 回放 |
| 4 | 体现需求拆解与 ToB 业务语义（售前 / 售后 / 库存） | 客户等级、阶梯价、账期、信用额度、多仓库存、预留、报价、订单、审批、售后工单 |

### 1.2 交付约束

- 团队：1 人全职冲刺，实际开发窗口 2026-11-03 至 2026-11-09，11-10 演示。
- 技术栈：TypeScript 全栈。React + Vite 前端，Node.js + Fastify 后端，SQLite + Drizzle ORM，LangGraph.js 编排。
- 模型：DeepSeek 等 OpenAI 兼容接口；必须支持无 Key 时的确定性 Mock 降级。
- 交付形态：本地一键启动 + Docker Compose；不依赖公网部署。
- 作业评分：场景贴合与工程完整性 25%、接口与协议规范性 20%、AI / RAG 技术深度 20%、AI 工具使用 20%、用户体验与交付 15%。

### 1.3 工作目录现状

目录 `C:\Users\ZhuanZ\Desktop\腾讯实训课作业` 当前只有作业 PDF，尚无代码，属于从零搭建。

---

## 2. 目标与非目标

### 2.1 目标

1. 做出一个 **AI 优先、而非聊天框套壳** 的 B2B 销售工作台。
2. 用一条完整业务主链路证明：自然语言 → 多工具编排 → 风控 → 人工确认 / 审批 → 真实业务落库 → 可解释回放。
3. 用工程证据而非形容词打动评委：协议契约测试、并发测试、Agent 评测集、Docker 一键启动、决策文档。
4. 演示可离线兜底：模型或网络故障时切换 Mock，仍能完整跑通动线。

### 2.2 非目标

- 多租户与真实 SSO；演示用角色切换代替登录。
- 真实支付、发票、物流、ERP / IM 对接。
- 完整 RBAC 管理后台、多级复杂审批流。
- 移动端原生应用。
- 全量 ERP 的 CRUD 页面。

---

## 3. 产品定义

### 3.1 定位

**工作名**：SalesPilot 销售作战室
**虚构客户**：云启科技，B2B IT / 办公设备经销商，3 个仓库、约 20 个 SKU、8 个企业客户。
**一句话**：不是「能聊天的 CRM」，而是「能替销售跑完一单、并且每一步都敢给经理看的 AI 销售同事」。

### 3.2 角色

| 角色 | 数据范围 | 能力 | 演示价值 |
|---|---|---|---|
| 销售小林 | 仅自己名下客户与单据 | 查询、报价、下单申请、售后工单 | 日常主视角，复合业务 |
| 销售经理老王 | 团队全部客户与单据 | 销售能力 + 审批 + 团队晨报 + 全局库存 | 风控放行、主动经营 |

权限在服务端工具层执行，不在前端隐藏按钮。角色切换是演示身份切换，不是真实认证。

### 3.3 5 分钟演示动线

1. **主动晨报**：登录后顶部「晨报 3」入口展开抽屉——华辰信用额度仅剩 8%、X1 低于安全库存、两张报价 48 小时内到期；每条带「为什么」和「帮我处理」。
2. **一句话复合业务**：小林说「给华辰设计的张总报 120 台 X1，月底前到货，账期按老客户」。Agent 依次解析客户 → 澄清两个「张总」→ 查三仓库存 → 算阶梯价与促销 → 校验信用 → 生成报价单预览。
3. **风控拦截 + 人工确认**：信用不足时 Agent 不硬做，给出风险说明与替代方案（拆单 / 预付 / 提额），小林确认后生成报价；转订单时触发审批，切到老王批准并留言，订单落库、库存锁定。
4. **全链路可解释**：任一步可展开工具名、入参、出参、耗时、token、命中的价格 / 售后政策原文与引用；整条 trace 可回放。
5. **售后闭环**：小林问「华辰上周那台开不了机，按政策怎么处理？」Agent 检索 DOA / 保修政策并带引用回答，直接创建售后工单与换机建议。

### 3.4 答辩叙事

先讲「销售的一天如何被 AI 接管」，再下钻「为什么它敢做写操作」：服务端权限、确认令牌、幂等、事务、审计、评测。产品故事与技术深度两头都能接住。

---

## 4. 业务域模型

### 4.1 数据表

> 所有金额字段统一以「分」为单位存整数（如 `total_cents`），避免浮点误差；展示层再格式化。

**主数据**

| 表 | 关键字段 | 说明 |
|---|---|---|
| users | id, name, role, team_id | sales / manager |
| customers | id, name, industry, level, owner_id, region, credit_limit, credit_used, payment_terms, status | 等级 A/B/C 决定价格与账期 |
| contacts | id, customer_id, name, title, phone, email, is_primary | 预埋两个「张总」 |
| products | id, sku, name, category, unit, list_price, cost, tax_rate, status | 约 20 个 SKU |
| price_rules | id, product_id, customer_level, min_qty, unit_price, priority, effective_from, effective_to | 阶梯价与促销 |
| warehouses | id, name, region | 3 个仓 |
| inventory | warehouse_id, product_id, on_hand, reserved, safety_stock, version | 可用量 = on_hand − reserved |

**交易与流程**

| 表 | 关键字段 | 状态机 |
|---|---|---|
| quotes | id, quote_no, customer_id, contact_id, owner_id, status, subtotal, discount_total, tax_total, total, valid_until, risk_flags, created_at | draft → approved（无风险）或 pending_approval（低于底线）；pending_approval → approved / rejected；approved → converted / expired / cancelled |
| quote_lines | id, quote_id, product_id, quantity, unit_price, discount_rate, line_total, warehouse_id | — |
| orders | id, order_no, quote_id, customer_id, owner_id, status, total, payment_terms, created_at | 无风险：reserved；有风险：pending_approval → reserved；reserved → fulfilled / cancelled |
| order_lines | id, order_id, product_id, quantity, unit_price, warehouse_id | — |
| stock_reservations | id, order_id, product_id, warehouse_id, quantity, status | active → consumed / released |
| approvals | id, type, target_type, target_id, requester_id, approver_id, status, reason, comment, decided_at | pending → approved / rejected / expired |
| after_sales_tickets | id, ticket_no, customer_id, order_id, product_id, serial_no, issue_type, description, status, policy_refs, resolution | open → processing → resolved / closed |

**智能与审计**

| 表 | 用途 |
|---|---|
| conversations / messages | 会话历史与消息 |
| traces / trace_events | 执行链路持久化、回放 |
| audit_logs | 用户、工具、参数摘要、结果、耗时、token |
| idempotency_keys | 写操作幂等重放 |
| confirmation_tokens | 写操作确认令牌，一次性、绑定用户与载荷 |
| knowledge_docs / knowledge_chunks | RAG 原文、切块、向量、引用元数据 |

### 4.2 业务硬规则

1. **库存**：`available = on_hand − reserved`，永不允许为负；下单与预留同一事务；用 `version` 乐观锁防并发超卖。
2. **信用**：`credit_used + 本次订单金额 > credit_limit` 时禁止直接下单，只能创建审批；经理批准后才创建订单并占用额度。
3. **价格**：服务端按「客户等级 × 数量阶梯」取价，促销按优先级叠加，受最低价保护；低于底线只能发起经理审批，Agent 不得自行降价。
4. **幂等**：所有写提交必须带 `idempotency_key`；重复提交返回首次结果并标记 `replayed: true`，不重复建单、不重复扣库存。
5. **确认**：所有写操作必须先 dry-run 生成预览与一次性确认令牌；模型永远拿不到令牌，只有前端能拿到并回传。
6. **状态**：非法状态流转一律拒绝，例如未批准的报价不能转订单、已过期的报价不能转换。

### 4.3 预埋演示数据

- 8 个客户：华辰设计（信用仅剩 8%）、远山制造、海川物流等；华辰有两位「张总」联系人。
- 20 个 SKU：笔记本 X1 / X2、显示器 M27、扩展坞 D6、键鼠套装等。
- 3 个仓库：上海、苏州、成都；X1 在上海缺货、苏州有货但 ETA 晚 2 天。
- 历史单据：12 张报价 / 订单，其中 2 张 48 小时内到期。
- 库存风险：至少 1 个 SKU 低于安全库存。
- 知识文档：报价与折扣政策、信用与账期政策、售后 / DOA 政策、产品 FAQ、合同条款，共 6–8 篇 Markdown。
- 所有 seed 使用固定 ID / 固定随机种子，保证演示可复现。

---

## 5. 系统架构

```
React SPA（对话 / 业务卡片 / 执行链路 / 晨报抽屉）
        │  REST + SSE
Fastify 后端
  ├─ OpenAI 兼容网关  /v1/chat/completions
  │    ├─ tools / tool_choice / role:tool 透传
  │    └─ SSE 流式 tool_calls 增量与 usage
  ├─ Agent Runtime（LangGraph.js 状态图）
  ├─ 会话与 Trace 服务
  ├─ Tool Registry（Zod / 权限 / 幂等 / 确认令牌 / 审计）
  ├─ Business Services（库存 / 定价 / 报价 / 订单 / 信用 / 售后 / 晨报）
  ├─ RAG（解析 → 切块 → 向量化 → 混合检索 → 重排 → 引用）
  └─ SQLite（业务 + 知识 + 审计 + trace + 幂等 + 令牌）
        │
  Provider Adapter → DeepSeek（OpenAI 兼容）/ Mock（确定性）
```

### 5.1 代码组织

```
apps/
  web/        React + Vite + Tailwind + shadcn/ui
  server/     Fastify + LangGraph.js + Drizzle
packages/
  shared/     Zod schema、类型、错误码、工具契约
knowledge/    知识库 Markdown
docs/         架构、ADR、评测报告、演示脚本
```

### 5.2 关键选型理由

- **SQLite + Drizzle**：零运维、迁移可复现、Docker 友好；数据访问层隔离，可换 Postgres。
- **LangGraph.js**：显式状态图，条件边和最大步数可控；便于画图与答辩解释。
- **Mock Provider**：确定性工具调用脚本，保证无网络也能演示，且用于协议契约测试。

---

## 6. 网关与协议规范

### 6.1 OpenAI 兼容接口

`POST /v1/chat/completions`

请求支持：`model`、`messages`、`tools`、`tool_choice`、`stream`、`temperature`、`max_tokens`。
响应支持：标准 `choices[].message.tool_calls`、`finish_reason: "tool_calls"`、`usage`；流式返回 `data: {...}` 增量与 `[DONE]`。
`role: "tool"` 消息必须携带 `tool_call_id`，网关原样传递给上游。

### 6.2 双链路

1. **工具链路**：业务 Agent 通过工具注册表调用 9 个业务工具。
2. **知识链路**：政策问答通过同一网关完成「查询改写 → 检索 → 生成 → 引用」。
两条链路共用模型适配层、错误规范和 SSE 透传，避免两套实现。

### 6.3 供应商与降级

- `LLM_PROVIDER=deepseek|mock`。
- `deepseek`：OpenAI 兼容 HTTP，主模型 `deepseek-chat`，超时 30s，重试 1 次（指数退避）。
- `mock`：按意图模式返回预置工具调用，确定性、可离线；前端顶部明确标注「Mock 演示模式」。
- 供应商错误统一映射为 `PROVIDER_ERROR` / `TIMEOUT`，不向前端泄露上游原始堆栈。

### 6.4 其他接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/chat` | SSE 对话，返回 trace 事件与产物 |
| GET | `/api/conversations` / `/:id` | 会话历史 |
| GET | `/api/traces/:id` | trace 详情与回放数据 |
| POST | `/api/confirmations/confirm` | 确认令牌兑换，执行写提交 |
| POST | `/api/approvals/:id/decide` | 经理审批，幂等 |
| GET | `/api/briefing` | 晨报数据 |
| GET | `/api/business/*` | 业务面板只读数据 |
| POST | `/api/demo/reset` | 重置演示数据（仅演示环境） |
| GET | `/health` | 健康检查 |
| GET | `/docs` | OpenAPI / Swagger UI |

---

## 7. Agent 编排

### 7.1 状态图

```
classify（意图 + 槽位）
   │
   ├─ 闲聊 / 越界 ──────────────→ respond（拒答 + 替代路径）
   ├─ 政策问答 → retrieve → generate（带引用）
   └─ 业务请求 → load_context → plan → tool ⇄ evaluate
                                   │
                                   ├─ 需要澄清 → clarify → 等待用户
                                   ├─ 达到目标 → respond
                                   └─ 写操作 → preview → respond（等待前端确认）
```

### 7.2 约束

- 意图四类：查询、复合业务、政策问答、写操作。
- 单轮工具调用预算最多 8 次；单工具最多重试 1 次；超限降级为「信息不足，请补充」。
- 模型输出视为不可信输入：未知工具、非法参数、越权请求在服务端拦截并回传结构化错误。
- 写操作永远停在**待确认**状态，由前端携带确认令牌完成提交；图本身不执行最终写入。
- 审批采用「持久化待审批状态 + 独立幂等审批事务」，不依赖长生命周期图检查点；角色切换、服务重启都不会丢状态。前端体验等同于 interrupt。

### 7.3 可解释性

- 展示「计划摘要」而非原始思维链：例如「先确认客户 → 再查三仓库存 → 再算阶梯价」。
- 每个工具步骤记录：工具名、入参、出参摘要、状态、耗时、token、命中的规则 / 文档。
- 失败步骤保留错误码与建议动作，便于回放分析。

---

## 8. 工具契约

### 8.1 统一返回信封

```ts
type ToolResult<T> =
  | {
      ok: true;
      data: T;
      meta: { latencyMs: number; citations?: Citation[] };
      warnings: string[];
      risk?: RiskFlag[];
    }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        message: string;
        details?: unknown;
        recoverable: boolean;
        suggestedAction?: string;
      };
    };
```

### 8.2 错误码

`VALIDATION_ERROR`、`NOT_FOUND`、`AMBIGUOUS_ENTITY`、`OUT_OF_STOCK`、`CREDIT_EXCEEDED`、`PRICE_FLOOR`、`FORBIDDEN`、`CONFLICT`、`INVALID_STATE`、`IDEMPOTENT_REPLAY`、`TOKEN_EXPIRED`、`TIMEOUT`、`PROVIDER_ERROR`。

### 8.3 工具清单（9 个）

| # | 工具 | 类型 | 权限 | 关键边界 |
|---|---|---|---|---|
| 1 | search_customers | 读 | 销售本人 / 经理团队 | 模糊匹配返回候选，不擅自选定 |
| 2 | get_customer_360 | 读 | 本人 / 团队 | 行级越权直接 FORBIDDEN |
| 3 | check_inventory | 读 | 全部 | 多仓可用量、ETA、拆仓方案、替代 SKU |
| 4 | get_pricing | 读 | 全部 | 等级价、阶梯、促销、底线；价格只信服务端 |
| 5 | search_knowledge | 读 | 全部 | 混合检索，必须返回引用；证据不足显式标记 |
| 6 | create_quote | 写 | 本人 / 团队 | dry-run → 确认令牌 → 提交；忽略客户端价格 |
| 7 | convert_quote_to_order | 写 | 本人 / 团队 | 校验报价状态、信用、库存、底线；触发审批 |
| 8 | create_after_sales_ticket | 写 | 本人 / 团队 | 关联订单 / SKU、政策引用、工单落库 |
| 9 | get_sales_briefing | 读 | 本人 / 团队 | 实时计算风险与到期，不写死文案 |

### 8.4 契约摘要

**search_customers**
`{ query, level?, limit? } → { customers: [{ id, name, level, ownerId, region, contactHighlights }] }`
多候选时 `meta.ambiguous = true`。

**get_customer_360**
`{ customerId } → { customer, contacts, credit: { limit, used, available, utilization }, recentOrders, receivables, openQuotes }`

**check_inventory**
`{ skuQuery, quantity?, needByDate?, region? } → { product, requestedQty, warehouses: [{ id, name, region, onHand, reserved, available, etaDays }], canFulfill, splitPlan?, alternatives }`

**get_pricing**
`{ customerId, items: [{ sku, quantity }] } → { lines: [{ sku, listPrice, tierPrice, promoAdjustment, finalPrice, floorPrice, belowFloor, ruleRefs }], subtotal, discountTotal, tax, total }`

**search_knowledge**
`{ query, docTypes?, topK? } → { chunks: [{ chunkId, docId, title, section, snippet, score, citation }], hasSufficientEvidence }`

**create_quote**
`{ customerId, contactId, lines, validDays?, notes?, dryRun, confirmationToken?, idempotencyKey }`
- dry-run：返回预览与一次性 `confirmationToken`（只下发前端，模型侧剥离）。
- commit：校验令牌、重新计算价格、写报价；无风险状态 `approved`，低于底线状态 `pending_approval`。
- 报价低于底线时须由经理审批，批准后状态变为 `approved` 才可转订单。
- 报价不占用信用额度。

**convert_quote_to_order**
`{ quoteId, paymentTerms?, dryRun, confirmationToken?, idempotencyKey }`
- dry-run：返回信用、库存、价格底线检查与 `requiresApproval`。
- commit：无风险直接创建订单并预留库存；有风险创建审批，不创建订单。
- 报价必须为 `approved`；过期返回 `INVALID_STATE`。

**create_after_sales_ticket**
`{ customerId, orderId?, productId, serialNo?, issueType, description, policyRefs, dryRun, confirmationToken?, idempotencyKey }`
- 政策引用必须来自 `search_knowledge` 的真实 chunk；否则 `VALIDATION_ERROR`。

**get_sales_briefing**
`{ scope: "self" | "team", date? } → { alerts: [{ type, severity, entityRef, why, suggestedAction }] }`
销售只能取 `self`，经理可取 `team`。

### 8.5 确认令牌与幂等

- dry-run 生成 HMAC 令牌：绑定 `actorId + tool + payloadHash + expiresAt(10min)`，入库且一次性使用。
- 令牌通过 SSE `artifact` 事件下发前端；工具返回给模型的结果中剥离令牌，只保留 `pending_confirmation` 摘要。
- 提交接口校验令牌、用户、载荷哈希和有效期；成功后标记已用。
- 提交必须带 `idempotencyKey`；重复请求返回首次结果并标记 `replayed`。

---

## 9. RAG 设计

### 9.1 入库

`knowledge/*.md` 带 frontmatter（id、title、type、effectiveDate）→ 解析 → 按标题层级切块（500–800 字，约 80 字重叠，保留父标题）→ 向量化 → 写 `knowledge_docs` / `knowledge_chunks`。以内容哈希做幂等，重复入库不产生重复块。

### 9.2 向量化

可插拔 `EmbeddingProvider`：
- `openai`：OpenAI 兼容 embedding 接口（如 bge-m3），需配置 Key。
- `local`：字符 3-gram 哈希向量（1024 维），零外部依赖，作为默认兜底。

### 9.3 检索

1. 关键词 BM25 取 Top 20（内存索引，避免中文 FTS5 分词问题）。
2. 向量余弦取 Top 20。
3. RRF 融合。
4. 可选 LLM 重排。
5. 取 Top 5 生成。

### 9.4 回答边界与引用

- 只依据检索内容回答；证据不足或最高分低于阈值时明确说「资料中没有」，并给人工 / 工单路径。
- 每个结论附 `docTitle + section + snippet + chunkId`。
- 文档冲突时并列展示，不擅自裁决。

### 9.5 评测

10 条政策问答题，检查引用文档与章节是否正确、是否越界编造。

---

## 10. 前端设计

### 10.1 布局（两栏 + 抽屉）

```
┌──────────────────────────────────────────────────┐
│ SalesPilot   [小林 ▾]   ● DeepSeek   [晨报 3]  [⋯] │
├──────────────────────────────┬───────────────────┤
│ 对话流（业务卡片内联）          │ 执行链路 | 业务     │
│                              │ ● 意图识别   12ms  │
│  ┌ 报价单预览 ─────────────┐  │ ● 查库存    210ms  │
│  │ 风险：信用不足 8%        │  │ ● 风控拦截   ⚠     │
│  │ [确认] [调整] [取消]     │  │                   │
│  └─────────────────────────┘  │ [展开 JSON][回放]  │
│                              │                   │
├──────────────────────────────┤                   │
│ [报价] [查库存] [写售后]  输入框 │                   │
└──────────────────────────────┴───────────────────┘
```

- 去掉常驻会话栏，历史会话收进顶部下拉。
- 晨报收进顶部入口 + 右侧抽屉，不常驻占位。
- 右侧固定一栏，仅「执行链路」「业务」两个页签；证据引用并入链路步骤；审计通过回放 / 导出 JSON 查看。
- 快捷操作是输入框上方 3 个 chip，点击填入示例指令。
- 重置演示数据、模型模式放入右上「⋯」菜单。
- 窄屏时右侧折叠为抽屉。

### 10.2 核心组件

- `ChatStream`：流式消息、计划摘要、工具 chip、业务卡片、澄清卡、确认卡、审批卡。
- `TraceTimeline`：步骤分组、展开入参/出参、耗时、token、读/写、幂等重放、风控拦截、Mock 标记。
- `BusinessPanel`：客户 360、库存表、报价单、审批、工单的上下文卡片。
- `BriefingDrawer`：3 条可操作提醒，带「为什么」「帮我处理」。
- `RoleSwitcher`：真实切换数据范围与工具权限。
- `Composer`：示例 chip、发送、停止生成、重试。

### 10.3 状态与异常

- 流式 loading、骨架屏、停止生成、断线重连（`Last-Event-ID`）。
- 供应商故障：顶部黄色横幅「已降级 Mock」，明确标注，不静默。
- 工具失败：内联错误卡，显示错误码、原因、重试 / 转人工。
- 空状态：3 条可点击示例指令。
- 「重置演示数据」保证连续演示不翻车。

### 10.4 视觉

企业级、数据密集、克制：浅色底 + 深蓝 / 青色强调；金额与 SKU 等宽字体；shadcn/ui + Tailwind + Lucide。避免渐变紫、发光边框等「AI 味」装饰，目标是 Linear / Stripe 式的可信感。

---

## 11. 安全与可靠性

- **权限**：角色 + 数据范围在工具层校验；前端隐藏只是体验，不是安全边界。
- **确认**：写操作预览 → 令牌 → 提交；令牌不进入模型上下文，防止模型自我确认。
- **幂等**：写提交强制幂等键；重复请求返回首次结果。
- **事务**：订单 + 预留 + 信用占用同事务；失败整体回滚。
- **并发**：库存乐观锁 + 版本号；并发测试验证不超卖。
- **提示注入**：知识内容视为不可信数据，分隔并禁止其中指令生效；工具白名单；参数强校验。
- **密钥**：`.env.example` 只放占位符；`.env` 入 `.gitignore`；日志脱敏。
- **限流**：按用户 / 会话限制请求频率与工具调用次数。
- **审计**：记录 traceId、用户、工具、参数摘要、结果、耗时、token；支持导出。
- **可观测**：pino 结构化日志、`/health`、错误码统计。

---

## 12. 测试与评测

| 层级 | 内容 | 工具 |
|---|---|---|
| 单元 | 阶梯价、促销叠加、信用、可用库存、状态机、令牌校验 | Vitest |
| 集成 | 9 个工具契约、OpenAI 网关（Mock Provider）、SSE 事件顺序、幂等重放 | Vitest + Fastify inject |
| 并发 | 20 个并发订单抢最后 1 件库存，仅 1 个成功 | Vitest |
| E2E | 晨报 → 报价 → 审批 → 下单 → 售后 | Playwright |
| Agent 评测 | 25 条 golden cases：意图、工具选择、参数、越权、超卖、重复提交、引用；其中 10 条为政策问答引用题 | 自建 eval 脚本 |

### 12.1 评测指标

- 意图分类准确率
- 工具选择准确率
- 参数抽取准确率
- 护栏通过率（越权 / 超卖 / 重复提交 / 越界回答）
- 引用准确率
- 平均工具步数、P95 端到端耗时

产出 `docs/EVAL_REPORT.md`，答辩时展示数字而非主观描述。

---

## 13. 交付物与部署

### 13.1 交付清单

- 本地一键启动 + Docker Compose；启动时自动迁移、灌 seed、健康检查。
- README（5 分钟内可启动）、`.env.example`（无真实 Key）、OpenAPI / Swagger（`/docs`）、统一错误码表。
- `scripts/smoke.sh` 与 curl 示例：覆盖工具调用、SSE、确认令牌、审批、幂等重放，作为联调证据。
- 架构文档、模块职责、关键决策记录（ADR）。
- `docs/DEMO_SCRIPT.md`：5 分钟逐句脚本 + 备用录屏。
- `docs/XBUDDY_LOG.md`：真实开发对话记录、AI 生成代码的校验与兜底说明。
- 测试与评测报告。
- PPT：痛点 → 产品演示 → 架构 → 工程决策 → 评测数据 → 复盘。

### 13.2 部署

- 开发：`pnpm dev`。
- 一键：`docker compose up`，Web 与 API 同源代理，SQLite 数据卷持久化。
- 仅在 `DEMO_MODE=true` 时启用 `POST /api/demo/reset`，用于重置 seed。
- 不要求公网部署；如现场网络允许，可加隧道，但不作为依赖。

---

## 14. 里程碑（2026-11-03 至 2026-11-10）

| 日期 | 目标 | 完成标志 |
|---|---|---|
| 11/03 | 脚手架、DB schema / 迁移 / seed、设计系统骨架 | `pnpm dev` 起前后端，数据库有演示数据 |
| 11/04 | 业务服务 + 9 个工具 + 规则单测 | 价格 / 库存 / 信用 / 幂等单测通过 |
| 11/05 | OpenAI 兼容网关 + LangGraph 状态图 + SSE + 确认 / 审批状态 | curl 可跑通工具调用，SSE 有事件 |
| 11/06 | 前端对话 + 执行链路 + 业务卡片 + 确认 / 审批卡 | 主链路可在浏览器跑通 |
| 11/07 | RAG 全链路 + 引用 + 晨报 + 经理视角 | 政策问答有引用，晨报可操作 |
| 11/08 | 评测集 + E2E + 并发 + Docker + 文档 | 评测报告有数字，Docker 一键起 |
| 11/09 | 彩排、备用录屏、PPT、XBuddy 记录、缓冲 | 5 分钟演示无卡点 |
| 11/10 | 汇报 | — |

---

## 15. 风险与取舍

| 风险 | 影响 | 对策 |
|---|---|---|
| 模型工具调用不稳定 | 演示翻车 | 严格 JSON Schema + 结构化错误回传 + 单次重试 + Mock 确定性回放 + 评测提前暴露 |
| 7 天做不完 | 交付不完整 | 预设砍单顺序：LLM 重排 → 在线部署 → 售后深度 → 动效；核心动线不动 |
| 现场网络 / API 故障 | 无法演示 | Mock 模式 + 备用录屏 + 重置 seed |
| RAG 向量依赖 | 入库 / 检索失败 | embedding 可插拔，本地 n-gram 兜底 |
| 并发写冲突 | 超卖 / 额度错乱 | 乐观锁 + 事务 + 并发测试 |
| 确认令牌被模型滥用 | 越权写入 | 令牌只下发前端，模型侧剥离；绑定用户、载荷、有效期、一次性 |
| XBuddy 记录不足 | AI 工具使用分低 | 开发过程中真实使用并导出记录，记录 AI 生成代码的校验过程 |

---

## 16. 验收标准

1. 作业 4 条硬性要求均可在 UI / 接口现场演示。
2. 全新克隆后按 README 一条命令启动；Docker 启动自动迁移与 seed。
3. 5 分钟金路径无手工改库、无控制台报错。
4. 越权、超卖、重复提交、过期报价转换均被拦截并给出可读原因。
5. 每个工具调用在 trace 中可见入参、出参、耗时与结果。
6. RAG 回答带文档名、章节、原文片段；无证据时明确拒答。
7. 25 条评测集全部有结果，报告含准确率与护栏通过率。
8. 断网或模型故障时可切换 Mock 完成整条演示。

---

## 17. 硬性要求对照表

| 作业要求 | 具体证据 |
|---|---|
| OpenAI 兼容工具调用透传 | `/v1/chat/completions` + curl / SDK 演示 + 协议契约测试 |
| 工具健壮性 | Zod、统一错误码、幂等键、确认令牌、乐观锁、事务、并发测试 |
| 思考 → 调用 → 结果可视化 | SSE 事件 + TraceTimeline + 业务卡片 + 回放 |
| ToB 业务语义 | 客户等级 / 信用 / 账期 / 多仓库存 / 阶梯价 / 报价 / 审批 / 售后 |
| RAG 深度 | 切块、混合检索、重排、引用、边界、评测 |
| 工程完整性 | Docker、OpenAPI、测试、评测报告、ADR、README |
| AI 工具使用 | `XBUDDY_LOG.md` + AI 代码校验记录 + 决策过程 |

---

## 18. 关键决策记录

1. **AI 优先工作台，而非完整 ERP**：7 天单人无法同时保证 CRUD 广度与 Agent 深度；选择一条主链路的深度。
2. **9 个工具，权限在工具层**：工具数量适合模型选择；服务端校验而非提示词约束。
3. **预览 → 令牌 → 提交**：解决「模型不能给自己授权」的问题；令牌不进入模型上下文。
4. **审批用持久化待审批状态**：比长生命周期图检查点更稳，服务重启和角色切换不丢状态。
5. **SQLite + Drizzle**：零运维、可复现；数据层可替换。
6. **Embedding 可插拔 + 本地兜底**：避免演示依赖外部 embedding 服务。
7. **Mock Provider**：离线兜底与协议测试，不与真实模型逻辑分叉。
8. **两栏 + 抽屉前端**：保留可解释性与业务卡片，砍掉常驻 Dashboard 的实现成本。
