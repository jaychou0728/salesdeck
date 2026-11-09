# SalesDeck 接口契约

> 实现代码：`apps/server/src/routes`、`apps/server/src/gateway`、`apps/server/src/tools`。
> 运行后可在 `/docs` 查看 Swagger UI。本文件描述跨端稳定的契约，字段级细节以 Zod schema（`packages/shared/src/schemas.ts`）为准。

## 1. 通用约定

### 1.1 Base URL 与身份

- 开发：`http://localhost:3000`
- 生产：Fastify 同时托管 API 与 `apps/web/dist`
- 身份：请求头 `x-actor-id`。演示账号：
  - `u_sales_lin` 销售小林（默认）
  - `u_manager_wang` 经理老王
- 未传时按 `u_sales_lin` 处理；未知账号返回 `403 FORBIDDEN`。这是演示身份，不是生产认证。

### 1.2 响应信封

业务 REST 路由：

```json
{ "ok": true, "data": { } }
```

错误：

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数不合法",
    "details": [],
    "suggestedAction": "请检查必填字段"
  }
}
```

工具写入 / 确认接口直接返回 `ToolResult`：

```ts
type ToolResult<T> =
  | { ok: true; data: T; meta: { latencyMs: number; citations?: Citation[] }; warnings: string[]; risk?: RiskFlag[] }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown; recoverable: boolean; suggestedAction?: string } };
```

### 1.3 错误码

| HTTP | code | 含义 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 参数不合法 |
| 400 | `OUT_OF_STOCK` | 库存不足 |
| 400 | `CREDIT_EXCEEDED` | 超出信用额度 |
| 400 | `PRICE_FLOOR` | 低于价格底线 |
| 400 | `INVALID_STATE` | 状态机不允许 |
| 400 | `TOKEN_EXPIRED` | 确认令牌过期/已用 |
| 400 | `AMBIGUOUS_ENTITY` | 实体不唯一 |
| 403 | `FORBIDDEN` | 角色或数据范围不足 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 并发修改 / 幂等键复用 |
| 504 | `TIMEOUT` | 模型或外部依赖超时 |
| 500 | `PROVIDER_ERROR` | 服务端/Provider 异常 |

审批接口失败时返回 `APPROVAL_FAILED`（HTTP 400）。

### 1.4 金额、时间与 ID

- 金额统一为整数「分」（`*Cents`）。
- 时间为 Unix 毫秒时间戳。
- 主键带前缀：`c_` 客户、`q_` 报价、`o_` 订单、`t_` 工单、`ap_` 审批、`tr_` trace。

## 2. OpenAI 兼容网关

### `POST /v1/chat/completions`

透传 OpenAI Chat Completions 协议，支持 `tools`、`role:tool`、`stream`。

请求：

```json
{
  "model": "deepseek-chat",
  "messages": [{ "role": "user", "content": "查询华辰设计的客户 360" }],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_customer_360",
        "description": "Get customer 360",
        "parameters": {
          "type": "object",
          "properties": { "customerId": { "type": "string" } },
          "required": ["customerId"]
        }
      }
    }
  ],
  "stream": false
}
```

- 不传 `model` 时使用服务端 `LLM_MODEL`；传了则透传给供应商。
- 非流式返回标准 `chat.completion`，工具调用时 `finish_reason` 为 `tool_calls`。
- 流式返回 `text/event-stream`，每帧 `data: <json>`，结束帧 `data: [DONE]`。
- 供应商配置见 [`providers/README.md`](../providers/README.md)。

## 3. 业务对话 SSE

### `POST /api/chat`

请求：

```json
{
  "message": "给华辰设计的张总报 120 台 X1",
  "conversationId": "conv_xxx",
  "actorId": "u_sales_lin"
}
```

响应 `text/event-stream`。帧格式：

```
id: 12
event: token
data: {"type":"token","payload":{"text":"..."}}
```

事件类型：

| type | 说明 |
|---|---|
| `trace.start` | 本轮 trace 开始 |
| `intent` | 规则识别出的意图（policy / business） |
| `plan` | 计划步骤 |
| `step.start` / `step.end` | LangGraph 节点或工具执行 |
| `retrieval` | RAG 检索结果与引用 |
| `token` | 最终文本增量 |
| `artifact` | 可渲染卡片（报价预览、确认卡、动作按钮） |
| `error` | 可恢复错误 |
| `trace.end` | 本轮结束 |

`conversationId` 相同则延续历史；不同身份的会话返回 403。

## 4. 写操作：预览 → 确认 → 执行

所有写工具必须两步：

### 4.1 预览（dry-run）

以报价为例：

```bash
POST /api/business/quotes/preview
x-actor-id: u_sales_lin

{
  "customerId": "c_huachen",
  "contactId": "ct_zhang_1",
  "lines": [{ "sku": "X1", "quantity": 2 }],
  "opportunityId": "o_huachen_server"
}
```

返回：

```json
{
  "ok": true,
  "preview": {
    "customer": { "id": "c_huachen", "name": "华辰设计", "level": "A", "creditAvailableCents": 9600000 },
    "lines": [{ "sku": "X1", "quantity": 2, "unitPriceCents": 724680, "belowFloor": false }],
    "totals": { "subtotalCents": 1449360, "taxTotalCents": 188417, "totalCents": 1637777 },
    "riskFlags": []
  },
  "input": { "customerId": "c_huachen", "contactId": "ct_zhang_1", "lines": [], "validDays": 7 },
  "confirmationToken": "ct_<hmac>"
}
```

- `confirmationToken` 绑定 `actorId + toolName + payloadHash + 10 分钟有效期`，一次性消费。
- 令牌只通过服务端响应/artifact 下发，不进入模型上下文；审计与 trace 会脱敏。

### 4.2 提交

```bash
POST /api/business/quotes/commit
x-actor-id: u_sales_lin

{
  "token": "ct_...",
  "payload": { ...预览返回的 input... },
  "idempotencyKey": "uuid"
}
```

通用确认入口（AI artifact 使用）：

```bash
POST /api/confirmations/confirm
{
  "token": "ct_...",
  "toolName": "create_quote",
  "payload": { ... },
  "idempotencyKey": "uuid"
}
```

规则：

- `toolName` 必须是写工具：`create_quote`、`convert_quote_to_order`、`create_after_sales_ticket`、`log_follow_up`、`update_opportunity_next_action`。
- 同一幂等键 + 同一请求体重复提交，返回首次结果并带 `replayed: true`。
- 同一幂等键用于不同请求体：`409 CONFLICT`。

## 5. 报价与拆单转订单

### 5.1 报价详情

`GET /api/business/quotes/:id`

```json
{
  "ok": true,
  "quote": { "id": "q_...", "quoteNo": "Q-2026-0008", "status": "approved", "totalCents": 1637777 },
  "customer": { "id": "c_huachen" },
  "contact": { "id": "ct_zhang_1" },
  "lines": [
    {
      "id": "ql_...",
      "quantity": 2,
      "convertedQuantity": 0,
      "unitPriceCents": 724680,
      "lineTotalCents": 1449360
    }
  ],
  "approval": null
}
```

### 5.2 转单预览（可选部分数量）

`POST /api/business/quotes/:id/convert-preview`

```json
{
  "lines": [
    { "quoteLineId": "ql_...", "quantity": 1 }
  ]
}
```

`lines` 可省略：省略即转换全部剩余数量。

响应预览关键字段：

```json
{
  "preview": {
    "quoteId": "q_...",
    "totalCents": 818889,
    "quoteTotalCents": 1637777,
    "creditAvailableCents": 9600000,
    "requiresApproval": false,
    "canFulfill": true,
    "partiallyConverted": false,
    "fullyConvertedAfter": false,
    "lines": [
      { "id": "ql_...", "remainingQuantity": 2, "convertingQuantity": 1, "remainingAfter": 1 }
    ],
    "stockChecks": [
      { "quoteLineId": "ql_...", "productId": "p_x1", "quantity": 1, "canFulfill": true, "missing": 0 }
    ]
  },
  "input": { "quoteId": "q_...", "lines": [{ "quoteLineId": "ql_...", "quantity": 1 }] },
  "confirmationToken": "ct_..."
}
```

### 5.3 转单提交

`POST /api/business/quotes/:id/convert`

```json
{
  "token": "ct_...",
  "payload": { "quoteId": "q_...", "lines": [{ "quoteLineId": "ql_...", "quantity": 1 }], "paymentTerms": "月结 30 天" },
  "idempotencyKey": "uuid"
}
```

返回：

```json
{
  "ok": true,
  "data": {
    "status": "committed",
    "order": {
      "id": "o_...",
      "orderNo": "SO-2026-0009",
      "totalCents": 818889,
      "fullyConverted": false,
      "remainingQuantity": 1
    }
  }
}
```

- 信用不足：`status: "pending_approval"` + `approvalId`，不创建订单。
- 库存不足：直接失败 `OUT_OF_STOCK`。
- 全部数量转完才把报价置为 `converted`、商机置为 `won`。
- 经理审批通过后，按审批载荷中的 `lines` 创建对应部分订单。

## 6. 审批

### `POST /api/approvals/:id/decide`

```json
{ "decision": "approve", "comment": "同意，注意回款", "idempotencyKey": "uuid" }
```

- `decision`：`approve` / `reject`。
- 仅经理可调用；跨团队审批返回 403。
- 幂等键重复提交返回首次结果。
- 订单转单审批通过会创建订单；驳回只更新商机下一步/风险，不改变报价有效状态。
- 信用提额审批通过会更新客户 `creditLimitCents`。

### 提额申请

`POST /api/business/customers/:id/credit-limit-requests`

```json
{ "requestedLimitCents": 200000000, "reason": "季度资信复核后申请提额" }
```

返回 `{ "ok": true, "approvalId": "ap_..." }`。销售只能为本人客户申请；申请额度必须高于当前额度。

### 经理直接调额

`PATCH /api/business/customers/:id/credit-limit`（经理）

```json
{ "limitCents": 150000000, "reason": "经理直接调整季度额度" }
```

- 不得低于 `creditUsedCents`。
- 会作废该客户所有 `pending` 提额审批，避免后续审批覆盖。
- 写审计 `update_credit_limit`。

## 7. 客户与联系人

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/api/business/customers` | 销售本人 / 经理团队 | 客户列表，支持 `?q=` |
| GET | `/api/business/customers/:id` | 同上 | 客户 360 |
| POST | `/api/business/customers` | 销售 / 经理 | 新建客户 |
| PATCH | `/api/business/customers/:id` | 销售基础字段 / 经理全部 | 编辑客户 |
| GET | `/api/business/team-members` | 经理 | 团队销售列表 |
| POST | `/api/business/customers/:id/contacts` | 同上 | 新增联系人 |
| PATCH | `/api/business/contacts/:id` | 同上 | 编辑联系人 |
| DELETE | `/api/business/contacts/:id` | 同上 | 删除联系人 |

客户创建示例：

```json
{
  "name": "东湖智造",
  "industry": "智能制造",
  "region": "武汉",
  "paymentTerms": "月结 30 天"
}
```

- 销售创建时只能归属本人，等级固定 `C`、初始额度 0。
- 经理可传 `level`、`ownerId`、`creditLimitCents`。

客户编辑示例（经理）：

```json
{ "level": "B", "ownerId": "u_sales_wang", "status": "inactive" }
```

- 销售可改：`name`、`industry`、`region`、`paymentTerms`。
- 仅经理可改：`level`、`ownerId`、`status`；`ownerId` 必须是同团队销售。

联系人：

```json
{ "name": "王助理", "title": "采购经理", "phone": "13800000000", "email": "wang@example.com", "isPrimary": true }
```

- 主要联系人全局唯一：设置新的主要联系人会取消旧的。
- 删除主要联系人后自动把剩余的第一位设为主要联系人。

## 8. 商机与跟进

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/business/workspace` | 作战室聚合 |
| GET | `/api/business/opportunities` | 列表，支持 `stage/risk/customerId/ownerId` |
| POST | `/api/business/opportunities` | 新建 |
| GET | `/api/business/opportunities/:id` | 详情 |
| PATCH | `/api/business/opportunities/:id` | 编辑 |
| POST | `/api/business/follow-ups` | 记录跟进 |

PATCH 允许字段：

```json
{
  "name": "服务器二期采购",
  "amountCents": 30000000,
  "stage": "negotiation",
  "probability": 80,
  "riskLevel": "high",
  "expectedCloseDate": 1790000000000,
  "nextAction": "确认合同条款",
  "nextActionDueAt": 1790000000000
}
```

销售只能操作本人商机；经理可操作团队商机。

## 9. 订单与售后

### `PATCH /api/business/orders/:id`

```json
{ "status": "fulfilled", "reason": "已发货，客户签收" }
```

- `fulfilled`：已预留订单 → 已履约；按预留记录扣减 `onHand` 与 `reserved`。销售/经理均可。
- `cancelled`：仅经理。释放库存预留、恢复信用占用、回退报价已转数量；报价恢复为 `approved`（过期则 `expired`），商机进入 `negotiation` 并写入下一步。
- 只有 `reserved` 状态可操作；其他状态返回 `INVALID_STATE`。

### `PATCH /api/business/tickets/:id`

```json
{ "status": "resolved", "resolution": "已安排换机，客户确认收货" }
```

状态流转：

```
open → processing → resolved → closed
open → resolved → closed
open → closed
```

- 标记 `resolved` 前必须有处理结果（本次提交或历史记录）。
- 只有向前流转；回退返回 `INVALID_STATE`。

## 10. 事务型业务工具

14 个工具由 `tools/registry.ts` 统一执行：

```
step.start → Zod 校验 → 角色校验 → 业务执行 → audit_logs → step.end → artifact
```

| 类型 | 工具 |
|---|---|
| 读（9） | `search_customers`、`get_customer_360`、`check_inventory`、`get_pricing`、`search_knowledge`、`get_sales_briefing`、`get_sales_priorities`、`get_opportunity_detail`、`suggest_actions` |
| 写（5） | `create_quote`、`convert_quote_to_order`、`create_after_sales_ticket`、`log_follow_up`、`update_opportunity_next_action` |

调用约定：

- 参数由 Zod 校验；失败返回 `VALIDATION_ERROR` 与 issues。
- 角色不符返回 `FORBIDDEN`；客户相关工具额外校验 `ownerId`。
- 写工具 `dryRun=true` 返回预览与 artifact；`dryRun=false` 必须带 `confirmationToken` 与 `idempotencyKey`。
- 参数与结果中的 `confirmationToken` / `idempotencyKey` / `token` 会在审计与 trace 中脱敏。

## 11. 权限矩阵

| 能力 | 销售 | 经理 |
|---|---|---|
| 查看客户 | 本人 | 团队 |
| 编辑客户基础资料 | 本人客户 | 团队客户 |
| 改客户等级 / 负责人 / 状态 | ✗ | ✓ |
| 申请提额 | 本人客户 | ✓（也可直接调额） |
| 直接调额 | ✗ | ✓ |
| 新建商机 / 报价 / 跟进 | 本人客户 | 团队客户 |
| 审批 | ✗ | ✓ |
| 库存调整 / 调拨 | ✗ | ✓ |
| 订单履约 | 本人订单 | 团队订单 |
| 取消订单 | ✗ | ✓ |
| 工单处理 | 本人客户 | 团队客户 |
| 查看审计 / trace | 本人 | 团队 |

## 12. 其它接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | `{ ok, provider }`，`provider=mock` 表示未接真实模型 |
| GET | `/api/traces/:id` | trace 与事件回放 |
| GET | `/api/conversations`、`/api/conversations/:id` | 会话历史 |
| POST | `/api/demo/reset` | 重置演示数据（仅 `DEMO_MODE=true`） |
| GET | `/docs` | Swagger UI / OpenAPI |

## 13. 请求示例（curl）

```bash
# 客户 360
curl -s http://localhost:3000/api/business/customers/c_huachen \
  -H 'x-actor-id: u_sales_lin'

# 报价预览 → 提交
TOKEN=$(curl -s http://localhost:3000/api/business/quotes/preview \
  -H 'content-type: application/json' \
  -H 'x-actor-id: u_sales_lin' \
  -d '{"customerId":"c_huachen","contactId":"ct_zhang_1","lines":[{"sku":"X1","quantity":2}]}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).confirmationToken')

# 经理直接调额
curl -s -X PATCH http://localhost:3000/api/business/customers/c_huachen/credit-limit \
  -H 'content-type: application/json' \
  -H 'x-actor-id: u_manager_wang' \
  -d '{"limitCents":150000000,"reason":"季度资信复核"}'
```
