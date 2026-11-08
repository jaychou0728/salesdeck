# SalesPilot 销售作战室

SalesPilot 是一个面向 B2B 销售团队的 **AI 优先销售工作台**：不是「能聊天的 CRM」，而是能替销售跑完一单——查客户、查多仓库存、按等级/阶梯算价、做信用风控、生成报价、转订单走审批、处理售后，并且每一步都可解释、可回放的 AI 销售同事。

- 场景：腾讯 AI Coding 课程作业 · 方向二 · 场景 3「业务智能体（销售 / CRM / 进销存自动化）」
- 技术栈：TypeScript 全栈（React + Vite · Fastify · LangGraph.js · SQLite + Drizzle）
- 模型：DeepSeek 等 OpenAI 兼容接口；无 Key 时自动降级为确定性 Mock

## 核心能力

| 能力 | 落点 |
|---|---|
| OpenAI 兼容网关 | `POST /v1/chat/completions` 透传 `tools`、`role:tool`、流式 `tool_calls` |
| 销售作战室 | 今日优先级、待办、风险商机、经理驾驶舱 |
| 商机与跟进 | 一客户多商机、下一步行动、跟进时间线与客户推进中心 |
| AI 主动推进 | 优先级查询、商机详情、记录跟进、更新下一步、动作建议，共 14 个工具 |
| 14 个工具 | 客户、360、库存、定价、知识检索、晨报、优先级、商机详情、动作建议、报价、转订单、售后工单、记录跟进、更新下一步 |
| 写操作安全 | dry-run 预览 → 一次性确认令牌 → 提交；幂等键防重复提交；服务端价格 |
| 拆单转订单 | 已批准报价可按明细数量分批转单，累计已转数量，剩余数量后续继续转；全部转完才关单 |
| 主数据维护 | 新建/编辑客户与联系人；经理可直接调额或审批销售提额；商机、工单、订单履约/取消均可操作并留审计 |
| 风控与权限 | 角色/数据范围在工具层校验；信用超额与低于底线走经理审批 |
| RAG 政策问答 | 本地 n-gram 向量 + BM25/RRF 混合检索；证据门槛；返回引用 |
| 可解释性 | SSE 展示「意图 → 工具调用 → 结果」，trace 持久化并可回放 |
| 双角色演示 | 销售小林 / 经理老王，切换数据范围与审批能力 |

## 5 分钟本地启动

前置：Node.js >= 22.18、pnpm 11。

```bash
cp .env.example .env
pnpm install
pnpm db:generate     # 生成 Drizzle 迁移（仓库已含迁移时可直接跳过）
pnpm db:migrate      # 建表
pnpm db:seed         # 灌入演示数据
pnpm dev             # 同时启动 server(3000) 与 web(5173)
```

打开 <http://localhost:5173>。默认 `LLM_PROVIDER=mock`，无需 API Key 即可完整演示；要接真实模型，在 `.env` 中设置 `LLM_PROVIDER=deepseek` 与 `DEEPSEEK_API_KEY`。

服务端启动时会自动执行迁移、在空库时自动 seed，并入库 `knowledge/*.md`。

### 验证模型是否接入成功

先看服务端实际使用的 Provider（不是前端顶部的静态文案）：

```bash
curl http://localhost:3000/health
# {"ok":true,"provider":"deepseek"}   # 若为 mock，说明 Key 或 LLM_PROVIDER 没被加载
```

再发一次真实对话与工具调用：

```bash
# 1) 普通对话：HTTP 200 且 content 正常
curl -s http://localhost:3000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-flash","messages":[{"role":"user","content":"Reply with exactly: OK"}]}'

# 2) 工具调用：finish_reason 应为 tool_calls
curl -s http://localhost:3000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-flash","messages":[{"role":"user","content":"Call get_customer_360 for customer c_huachen. Use the tool, do not answer in text."}],"tools":[{"type":"function","function":{"name":"get_customer_360","description":"Get customer 360","parameters":{"type":"object","properties":{"customerId":{"type":"string"}},"required":["customerId"]}}}]}'
```

说明：

- 服务端显式加载仓库根目录 `.env`（`apps/server/.env` 可覆盖），所以 `pnpm dev` 也能读到根 `.env`。
- 改 `.env` 后需要**重启** `pnpm dev`（tsx watch 不监听 `.env`）。
- 本机已实测 `DEEPSEEK_MODEL=deepseek-flash` 可用；如果换 Key/账号后报 model 不存在，改成 `deepseek-chat` 或 `deepseek-reasoner`。
- 401 / 402 / 404 分别检查 Key、余额、模型名；网关会返回 502 和错误信息。

### 环境变量

见 `.env.example`：`PORT`、`DATABASE_URL`、`LLM_PROVIDER`、`DEEPSEEK_*`、`CONFIRMATION_SECRET`、`DEMO_MODE`、`EMBEDDING_PROVIDER`。`.env` 不入库，`.env.example` 只放占位符。

## Docker

```bash
docker compose up --build
```

- 单容器：构建 shared/server/web，生产模式下由 Fastify 同时托管 API 与 `web/dist`。
- SQLite 数据卷：`./data:/app/data`。
- 健康检查：容器内请求 `http://127.0.0.1:3000/health`。
- 默认 Mock 模式，可用 `LLM_PROVIDER=deepseek docker compose up` 覆盖。

> **注意：本机未安装 Docker（`docker: command not found`），因此 Docker 镜像构建与 `docker compose up` 尚未实际验证。** `Dockerfile` / `docker-compose.yml` 按设计文档提供，待具备 Docker 环境后补测。

## 测试与评测

```bash
pnpm test        # 单元 + 集成测试（Vitest）
pnpm test:e2e    # Playwright 端到端（晨报 → 报价 → 审批 → 下单 → 售后）
pnpm eval        # Agent golden cases 评测（30 条），生成 docs/EVAL_REPORT.md
pnpm build       # 依次构建 shared / server / web
```

评测使用真实工具注册表 + LangGraph 状态图 + MockProvider，每条用例独立内存库并重新 seed / 入库知识库。当前结果见 [`docs/EVAL_REPORT.md`](docs/EVAL_REPORT.md)。

## 演示与文档

- 5 分钟演示脚本：[`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)
- 架构说明：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 关键决策记录：[`docs/ADR.md`](docs/ADR.md)
- 评测报告：[`docs/EVAL_REPORT.md`](docs/EVAL_REPORT.md)
- 答辩 PPT 提纲：[`docs/PPT_OUTLINE.md`](docs/PPT_OUTLINE.md)
- 联调脚本：`scripts/smoke.sh`（需服务端已启动；`BASE` 可覆盖地址）

## 目录结构

```
apps/
  server/          Fastify + LangGraph + Drizzle
    src/
      agent/       Provider 适配、LangGraph 状态图、trace
      db/          Schema、迁移、seed
      domain/      定价、库存、信用、状态机、权限、幂等、确认令牌、审批、优先级、作战室、跟进
      eval/        Agent golden cases 评测入口
      gateway/     OpenAI 兼容网关、SSE
      rag/         切块、n-gram 向量、入库、混合检索
      routes/      chat / confirmations / approvals / briefing / business / workspace / followUps / traces / demo
      tools/       14 个工具（9 读 + 5 写）与注册表
  web/             React + Vite + Tailwind 两栏工作台
    src/
      api/         SSE 客户端
      components/  对话流、执行链路、业务面板、晨报抽屉、确认/审批卡
      state/       Zustand 状态
packages/shared/   Zod schema、类型、错误码、工具契约
knowledge/         企业政策 / FAQ / 合同 Markdown
evals/             golden-cases.json
scripts/           smoke.sh
docs/              架构、ADR、评测、演示、XBuddy、PPT 提纲
```

## XBuddy 记录说明

`docs/XBUDDY_LOG.md` 仅提供**记录模板**。按要求必须粘贴与 XBuddy 的**真实对话记录**及对 AI 生成代码的校验/兜底过程，仓库中不预置、不虚构任何对话内容。

## 已知限制

- 演示身份切换代替真实登录/SSO，不构成生产级认证。
- 不接真实支付、发票、物流、ERP / IM。
- Embedding 为本地离线 n-gram 哈希向量，后续可替换为 OpenAI 兼容 embedding。
- `POST /api/demo/reset` 仅在 `DEMO_MODE=true` 时开放。
