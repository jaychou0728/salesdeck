# SalesPilot 架构说明

本文描述**当前实现**，与代码保持一致；设计演进见 [`ADR.md`](ADR.md)，原始设计稿见 `docs/superpowers/specs/`。

## 1. 总览

```
React SPA（作战室首页 + 商机/客户推进中心 + AI 抽屉）
        │  REST + SSE
Fastify 后端
  ├─ /v1/chat/completions        OpenAI 兼容网关（tools / role:tool / 流式 tool_calls）
  ├─ /api/chat                   SSE 业务对话（trace 事件 + artifact）
  ├─ Agent Runtime               LangGraph.js 显式状态图
  ├─ Trace 服务                  事件持久化 + 回放查询
  ├─ Tool Registry               14 个工具：Zod 校验 / 角色权限 / 审计 / SSE 步骤
  ├─ Workspace Service           优先级引擎、商机/跟进聚合、经理驾驶舱
  ├─ Business Services           定价、库存、信用、状态机、幂等、确认令牌、审批、晨报
  ├─ RAG                         切块 → n-gram 向量 → BM25+向量 RRF → 证据门槛 → 引用
  └─ SQLite + Drizzle            业务 / 知识 / 审计 / trace / 幂等 / 令牌
        │
  Provider Adapter → DeepSeek（OpenAI 兼容）/ Mock（确定性）
```

## 2. 代码模块

| 模块 | 路径 | 职责 |
|---|---|---|
| shared 契约 | `packages/shared/src` | Zod 输入 schema、类型、错误码、ToolResult / TraceEvent |
| Provider | `apps/server/src/agent` | `ChatProvider` 接口、DeepSeek、Mock、LangGraph 图、trace 记录 |
| 数据库 | `apps/server/src/db` | Schema、迁移、seed 数据 |
| 业务域 | `apps/server/src/domain` | 定价、库存分配、信用、状态机、权限、幂等、确认令牌、审批、订单 |
| 工具 | `apps/server/src/tools` | 9 个读工具 + 5 个写工具、注册表与统一执行器 |
| RAG | `apps/server/src/rag` | Markdown 切块、哈希向量、入库、混合检索 |
| 网关 | `apps/server/src/gateway` | OpenAI 兼容路由、SSE 封装 |
| 路由 | `apps/server/src/routes` | chat、确认、审批、晨报、业务面板、会话、trace、demo reset |
| 评测 | `apps/server/src/eval/run.ts` | 30 条 golden cases，生成 `docs/EVAL_REPORT.md` |
| 前端 | `apps/web/src` | 作战室、商机页、客户推进中心、AI 抽屉与业务卡片 |

依赖方向：`routes → agent/tools → domain → db`；`shared` 只放契约，不依赖运行时。

## 3. Agent 流程（LangGraph 状态图）

`buildAgentGraph` 编译以下节点（`apps/server/src/agent/graph.ts`）：

```
START → classify
classify ──(intent=policy)──→ retrieve → agent
         └─(intent=business)──────────→ agent
agent ──(有 tool_calls)──→ tools ──(未待确认/未超预算/步数<8)──→ agent
        └─(无 tool_calls)────────────────────────────→ respond → END
tools ──(pendingConfirmation / budgetExceeded / stepCount>=8)──→ respond
```

- **classify**：用规则识别 `policy`（政策/保修/DOA/退换/换机/合同/账期/怎么处理）与 `business`，发出 `intent` 与 `plan` 步骤事件。
- **retrieve**：仅政策意图时直接调用 `search_knowledge`，把引用与证据充分性写入对话上下文和状态，发出 `retrieval` 步骤事件。
- **agent**：调用 `provider.chat`，携带系统提示、历史消息与全部工具 JSON Schema。
- **tools**：逐个执行模型返回的工具调用；单工具最多 2 次，整体步数上限 8；把结构化结果（含错误）回传给模型。写工具返回 `pending_confirmation` 时置 `pendingConfirmation`，图停在待确认。
- **respond**：输出最终文本，发出 `token` 事件。

状态字段：`messages`、`actor`、`traceId`、`intent`、`stepCount`、`pendingConfirmation`、`citations`、`toolCalls`、`toolCounts`、`budgetExceeded`、`finalText`。

**Mock Provider** 按输入关键词返回确定性的工具调用脚本（晨报、客户 360、库存、价格、知识检索、售后、报价、转订单，以及主动推进、优先级、记录跟进、更新下一步），用于离线演示、协议测试与评测；除非显式 `LLM_PROVIDER=deepseek` 且存在 Key，否则自动使用 Mock。

### 3.1 作战室数据流

```text
opportunities + follow_ups + quotes + orders + inventory + credit
        ↓
domain/priority.ts（金额 × 概率 × 紧迫度 × 风险，输出 P0/P1/P2 与原因）
        ↓
domain/workspace.ts（self / team 聚合：指标、优先级、待办、风险、排行）
        ↓
/api/business/workspace ──→ 前端作战室 / 经理驾驶舱
        └──→ get_sales_priorities / get_opportunity_detail（AI 工具）
```

AI 与前端共用同一套 `domain/workspace` 输出，避免“页面看到的优先级”和“AI 判断的优先级”不一致。

## 4. 工具契约（14 个）

统一返回信封：

```ts
type ToolResult<T> =
  | { ok: true;  data: T; meta: { latencyMs: number; citations?: Citation[] }; warnings: string[]; risk?: RiskFlag[] }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown; recoverable: boolean; suggestedAction?: string } };
```

错误码：`VALIDATION_ERROR`、`NOT_FOUND`、`AMBIGUOUS_ENTITY`、`OUT_OF_STOCK`、`CREDIT_EXCEEDED`、`PRICE_FLOOR`、`FORBIDDEN`、`CONFLICT`、`INVALID_STATE`、`IDEMPOTENT_REPLAY`、`TOKEN_EXPIRED`、`TIMEOUT`、`PROVIDER_ERROR`。

| # | 工具 | 类型 | 输入要点 | 关键实现 |
|---|---|---|---|---|
| 1 | `search_customers` | 读 | `query, level?, limit?` | 名称/地区/联系人模糊匹配；返回候选与 `ambiguous`，不自动选定；销售仅本人客户 |
| 2 | `get_customer_360` | 读 | `customerId` | 客户、联系人、信用（额度/已用/可用/利用率）、最近 5 单、未结报价；行级权限 |
| 3 | `check_inventory` | 读 | `skuQuery, quantity?, needByDate?, region?` | 多仓 `available = onHand − reserved`、ETA、拆仓分配、过滤条件、替代仓 |
| 4 | `get_pricing` | 读 | `customerId, items[{sku,quantity}]` | 服务端按客户等级 × 数量阶梯取价，叠加促销，受价格底线保护，返回含税总额与 ruleRefs |
| 5 | `search_knowledge` | 读 | `query, docTypes?, topK?` | 混合检索；返回 `chunks[]` 与 `hasSufficientEvidence`；证据不足给出警告 |
| 6 | `get_sales_briefing` | 读 | `scope, date?` | 实时计算信用风险、库存风险、48h 内到期报价；`team` 仅经理 |
| 7 | `create_quote` | 写 | `customerId, contactId, lines, validDays?, dryRun, confirmationToken?, idempotencyKey?` | dry-run 出预览与令牌；提交时重算价格；低于底线转 `pending_approval` |
| 8 | `convert_quote_to_order` | 写 | `quoteId, paymentTerms?, dryRun, ...` | 校验报价状态、信用、库存；库存不足直接拒绝；信用不足创建审批，不建订单 |
| 9 | `create_after_sales_ticket` | 写 | `customerId, orderId?, productId, serialNo?, issueType, description, policyRefs[], dryRun, ...` | `policyRefs` 必须真实存在于知识库 chunk；先预览再提交 |
| 10 | `get_sales_priorities` | 读 | `scope, limit?, focus?` | 复用 `domain/workspace`，返回今日优先级、指标、待办；`team` 仅经理 |
| 11 | `get_opportunity_detail` | 读 | `opportunityId` | 商机 + 客户 + 关联报价/订单 + 跟进 + 风险信号 + 建议下一步 |
| 12 | `log_follow_up` | 写 | `customerId, opportunityId?, type, content, result?, nextAction?, nextActionDueAt?, dryRun, ...` | dry-run 预览；提交写跟进并同步商机下一步与最近跟进时间 |
| 13 | `update_opportunity_next_action` | 写 | `opportunityId, nextAction, nextActionDueAt?, dryRun, ...` | dry-run 预览；提交更新商机下一步 |
| 14 | `suggest_actions` | 读 | `actions[{label, prompt}]` | 返回 `actions` artifact，前端渲染可点击选项；无业务副作用 |

注册表统一执行流程（`tools/registry.ts`）：`step.start` → Zod 校验 → 角色校验 → 执行业务 → 写 `audit_logs` → `step.end` → 发送 `artifact`。参数与结果中的 `confirmationToken` / `idempotencyKey` / `token` 会脱敏后才进入审计与事件。

权限：`allowedRoles` 在工具层执行；客户相关工具额外调用 `assertCustomerAccess`（销售只能访问 `ownerId = actor.id` 的客户）。

## 5. 写操作安全

1. **预览 + 确认令牌**：写工具 `dryRun=true` 返回预览，并通过 SSE `artifact` 把 HMAC 令牌下发给前端；令牌绑定 `actorId + toolName + payloadHash + expiresAt(10min)`，一次性消费。
2. **提交**：`POST /api/confirmations/confirm` 携带 `token + toolName + payload + idempotencyKey`，服务端校验签名、用户、载荷哈希、有效期与未使用。
3. **幂等**：写提交必须带 `idempotencyKey`；按 `stableStringify(request)` 计算哈希，重复请求返回首次结果并标记 `replayed: true`，键被不同请求复用时返回 `CONFLICT`。
4. **事务与乐观锁**：订单创建、库存预留与信用占用在同一事务内完成；库存使用 `version` 乐观锁防止超卖。
5. **审批持久化**：信用超额 / 报价低于底线时落 `approvals` 待审批记录，经理通过 `POST /api/approvals/:id/decide` 决定，不依赖长生命周期图检查点。

## 6. RAG

- **入库**：`knowledge/*.md`（frontmatter：`id/title/type/effectiveDate`）→ 按标题切块（约 500–800 字，保留父标题）→ 写入 `knowledge_docs` / `knowledge_chunks`；内容哈希幂等，重复入库不重复。
- **向量**：本地 `hashEmbedding` 字符 n-gram 哈希向量（1024 维），零外部依赖、离线可跑；`EmbeddingProvider` 预留可替换。
- **检索**：对 chunk 文本做 BMI25 关键词打分与余弦向量打分，用 RRF（k=60）融合后取 Top K。
- **证据门槛**：只有与查询共享真实词项（ASCII 词长度 ≥2 或中文 bigram，含少量口语别名如「开不了机 → 无法开机」）的 chunk 才计为证据；单字命中不算，避免「设计」的「计」误命中。无证据时 `hasSufficientEvidence=false`，回答明确说资料中没有并建议转人工/建工单。
- **引用**：每个 chunk 返回 `docId/title/section/snippet/chunkId/score`，写入 `ToolResult.meta.citations` 与 trace。
- **知识资产**：`knowledge/` 下 6 篇（售后、DOA、报价、信用、合同、产品 FAQ）。

## 7. 前端与 SSE

- **布局**：React + Vite + Tailwind。首页为销售作战室：指标条、AI 今日建议（P0/P1/P2 卡片）、我的待办、风险商机、经理销售排行；商机页与客户推进中心展示当前商机、下一步、AI 判断与跟进时间线。AI 助手保留为右侧抽屉，内含 `ChatStream`、报价/跟进/下一步确认卡与「查看执行详情」；顶部可切换销售/经理身份。
- **流式协议**：`POST /api/chat` 使用 SSE，帧格式 `id: n` / `event: <type>` / `data: <json>`；事件类型包括 `trace.start`、`step.start`、`step.end`、`token`、`artifact`、`error`、`trace.end`。
- **客户端**：`apps/web/src/api/sse.ts` 使用 `fetch` + `ReadableStream` 解析帧；`state/store.ts`（Zustand）累积消息、trace 与 artifact。
- **可解释性**：`TraceTimeline` 展示每步名称、状态与入参/出参 JSON；`BusinessPanel` 读取 `/api/business/*` 展示客户、库存、报价、审批；trace 持久化后可通过 `GET /api/traces/:id` 回放。
- **降级提示**：顶部固定标注 `Mock / DeepSeek`，避免把 Mock 结果误认为真实模型。

## 8. API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| POST | `/v1/chat/completions` | OpenAI 兼容网关，支持 tools 与非流式/流式 |
| POST | `/api/chat` | SSE 业务对话 |
| POST | `/api/confirmations/confirm` | 确认令牌兑换并提交写操作 |
| POST | `/api/approvals/:id/decide` | 经理审批（幂等） |
| GET | `/api/briefing?scope=self\|team` | 晨报 |
| GET | `/api/business/workspace` | 作战室聚合：指标、优先级、待办、风险、团队排行 |
| POST | `/api/business/opportunities` | 为权限范围内客户新建商机 |
| GET | `/api/business/opportunities` | 商机列表（stage / risk / customerId / ownerId 筛选） |
| GET | `/api/business/opportunities/:id` | 商机详情、关联交易与跟进 |
| PATCH | `/api/business/opportunities/:id` | 更新阶段、概率、风险、下一步 |
| POST | `/api/business/follow-ups` | 记录跟进并同步商机下一步 |
| GET | `/api/business/{customers,inventory,quotes,approvals}` | 业务面板只读数据 |
| GET | `/api/conversations`、`/api/conversations/:id` | 会话历史 |
| GET | `/api/traces/:id` | trace 详情与事件序列 |
| POST | `/api/demo/reset` | 重置演示数据（仅 `DEMO_MODE=true`） |
| GET | `/docs` | Swagger UI / OpenAPI |

## 9. 数据模型

- **主数据**：`users`（含 `monthly_target_cents`）、`customers`、`contacts`、`products`、`price_rules`、`warehouses`、`inventory`。
- **商机与跟进**：`opportunities`、`follow_ups`；`quotes.opportunity_id`、`orders.opportunity_id` 显式关联商机。
- **交易**：`quotes`、`quote_lines`、`orders`、`order_lines`、`stock_reservations`、`approvals`、`after_sales_tickets`。
- **智能与审计**：`conversations`、`messages`、`traces`、`trace_events`、`audit_logs`、`idempotency_keys`、`confirmation_tokens`、`knowledge_docs`、`knowledge_chunks`。
- 金额统一以「分」为整数存储；seed 使用固定 ID 与相对当前时间的有效期，保证可复现。

## 10. 部署与运行

- 开发：`pnpm dev`（shared 先构建，server 与 web 并行）。
- 生产：`pnpm build` 后 `node apps/server/dist/index.js`；`NODE_ENV=production` 时 Fastify 托管 `apps/web/dist` 并对非 API 路径回退 `index.html`。
- Docker：`Dockerfile` 多阶段构建 + `docker-compose.yml`（端口 3000、`./data` 持久化、healthcheck）。**本机未安装 Docker，镜像构建与 compose 启动尚未验证。**
- 启动时自动迁移；空库自动 seed；每次启动按内容哈希幂等入库知识库。

## 11. 质量证据

- Vitest：shared 14 个测试 + 服务端 125 个测试，覆盖定价、库存、信用、状态机、幂等、确认令牌、14 个工具契约、优先级引擎、workspace 聚合、商机创建/跟进、审批驳回、OpenAI 网关、SSE、路由、RAG；OpenAPI 暴露 20+ 条路径。
- Playwright：9 条端到端测试（含作战室、商机创建、客户跟进、经理视图、AI 推进与审批驳回）。
- Agent 评测：30 条 golden cases，当前通过率 100%（见 `docs/EVAL_REPORT.md`）。
