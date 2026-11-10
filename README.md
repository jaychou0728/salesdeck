# SalesDeck 销售作战室

SalesDeck 是一个面向 B2B 销售团队的 **AI 优先销售工作台**：不是「能聊天的 CRM」，而是能替销售跑完一单——查客户、查多仓库存、按等级/阶梯算价、做信用风控、生成报价、拆单转订单走审批、处理售后，并且每一步都可解释、可回放的 AI 销售同事。

- 场景：腾讯 AI Coding 课程作业 · 方向二 · 场景 3「业务智能体（销售 / CRM / 进销存自动化）」
- 技术栈：TypeScript 全栈（React + Vite · Fastify · LangGraph.js · SQLite + Drizzle）
- 模型：任意 OpenAI 兼容供应商（DeepSeek / OpenAI / 通义千问 / Kimi / 智谱 / OpenRouter / Ollama / LiteLLM …）；无 Key 时自动降级为确定性 Mock
- 部署：生产构建由 Fastify 单端口托管，可配合 Cloudflare Tunnel 从校园机房直接访问

## 核心能力

| 能力 | 落点 |
|---|---|
| 销售作战室 | 今日优先级、待办、风险商机、经理驾驶舱，AI 与页面共用同一套优先级引擎 |
| 商机与跟进 | 一客户多商机、下一步行动、跟进时间线与客户推进中心 |
| AI 主动推进 | 优先级查询、商机详情、记录跟进、更新下一步、动作建议，共 14 个工具 |
| 写操作安全 | dry-run 预览 → 一次性确认令牌 → 提交；幂等键防重复；服务端价格与权限 |
| 拆单转订单 | 按明细数量分批转单，累计已转数量，全部转完才关单；取消订单自动回退库存、信用与已转数量 |
| 主数据维护 | 新建/编辑客户与联系人；经理直接调额或审批提额；商机、工单、订单履约/取消均可操作并留审计 |
| 风控与权限 | 角色/数据范围在工具层校验；信用超额、低于价格底线、取消订单固定走经理权限 |
| RAG 政策问答 | 本地 n-gram 向量 + BM25/RRF 混合检索；证据门槛；返回引用 |
| 可解释性 | SSE 展示「意图 → 工具调用 → 结果」，trace 持久化并可回放 |
| 多模型接入 | 供应商预设 + 通用 `LLM_BASE_URL/API_KEY/MODEL`，可选 LiteLLM 统一代理 |

## 5 分钟本地启动

前置：Node.js >= 22.18、pnpm 11。

```bash
cp .env.example .env
pnpm install
pnpm db:migrate     # 仓库已含迁移；新库执行一次
pnpm db:seed        # 可选，空库启动时会自动 seed
pnpm dev            # server:3000 + web:5173
```

打开 <http://localhost:5173>。默认 `LLM_PROVIDER=mock`，无需 API Key 即可完整演示。

服务端启动时会自动执行迁移、在空库时自动 seed，并按内容哈希幂等入库 `knowledge/*.md`。

### 切换真实模型

最短路径（DeepSeek）：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxx
# 可选
LLM_MODEL=deepseek-chat
```

其他厂商直接换 `LLM_PROVIDER` 即可，例如 `qwen`、`kimi`、`zhipu`、`openai`、`openrouter`、`groq`、`ollama`。完整的供应商表、通用变量和 LiteLLM 方案见 [`providers/README.md`](providers/README.md)。

验证实际生效的 Provider：

```bash
curl -s http://localhost:3000/health
# {"ok":true,"provider":"deepseek"}
```

页面右上角的 `AI: xxx` 徽标也显示当前实际 Provider。如果显示 `AI: Mock`，服务端启动日志会给出配置错误原因（缺 Key、缺模型名或 Base URL），或说明你正在使用公网演示的默认 Mock 模式。

## 公网演示（Cloudflare Tunnel）

明天在机房访问，用一条命令即可：

```bash
pnpm demo:tunnel        # 公网演示，默认 Mock
pnpm demo:tunnel --ai   # 公网演示 + 真实模型（读取 .env 的 LLM_PROVIDER/Key）
```

脚本会：

1. 如缺少生产构建则执行 `pnpm build`；
2. 以 `NODE_ENV=production` 启动 Fastify（端口 3000；被占用时自动换 3200）；
3. 启动 `cloudflared` 快速隧道，打印 `https://xxx.trycloudflare.com` 公网地址；
4. 自动生成一个访问账号（`demo / 随机 8 位密码`），浏览器打开公网地址时输入即可；
5. 把地址写入 `data/tunnel-url.txt`，按 `Ctrl+C` 同时停止服务和隧道。

固定访问密码（方便提前发给同学）：

```bash
DEMO_PASSWORD=mycode pnpm demo:tunnel --ai
```

也可以在 `.env` 配好真实模型后显式覆盖：

```bash
LLM_PROVIDER=deepseek pnpm demo:tunnel
```

> `--ai` 会让公网访客消耗你的 API 额度。务必设置访问密码；页面右上角 `AI: deepseek` 表示真实模型生效，`AI: Mock` 表示仍在 Mock 模式。公网仅含种子数据，`POST /api/demo/reset` 仅在 `DEMO_MODE=true` 时开放。

前置：`cloudflared` 已安装（本机已安装）。没有时：

```bash
winget install --id Cloudflare.cloudflared -e
```

> 快速隧道的域名每次启动都会变化，且依赖本机保持开机、联网。需要固定域名时，用 Cloudflare 账号创建命名隧道：
>
> ```bash
> cloudflared tunnel login
> cloudflared tunnel create salesdeck
> cloudflared tunnel route dns salesdeck salesdeck.example.com
> cloudflared tunnel run --url http://127.0.0.1:3000 salesdeck
> ```
>
> 公开演示仅含种子数据；`POST /api/demo/reset` 仅在 `DEMO_MODE=true` 时开放。不要把真实客户数据放到公网隧道里。

## 测试与评测

```bash
pnpm typecheck   # shared + server + web
pnpm test        # Vitest：shared 14 + 服务端 149
pnpm test:e2e    # Playwright：19 条端到端
pnpm eval        # 30 条 Agent golden cases，生成 docs/EVAL_REPORT.md
pnpm build       # shared / server / web
```

评测使用真实工具注册表 + LangGraph 状态图 + MockProvider，每条用例独立内存库并重新 seed / 入库知识库。当前结果见 [`docs/EVAL_REPORT.md`](docs/EVAL_REPORT.md)。

## 文档

- 接口契约：[`docs/API.md`](docs/API.md)
- 架构说明：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 模型接入：[`providers/README.md`](providers/README.md)
- AI Coding 使用记录：[`docs/AI_CODING_LOG.md`](docs/AI_CODING_LOG.md)
- 5 分钟演示脚本：[`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)
- 关键决策记录：[`docs/ADR.md`](docs/ADR.md)
- 评测报告：[`docs/EVAL_REPORT.md`](docs/EVAL_REPORT.md)
- 答辩 PPT 提纲：[`docs/PPT_OUTLINE.md`](docs/PPT_OUTLINE.md)
- OpenAPI / Swagger UI：启动后访问 <http://localhost:3000/docs>

## 目录结构

```
apps/
  server/          Fastify + LangGraph + Drizzle
    src/
      agent/       Provider 适配（OpenAI 兼容）、LangGraph 状态图、trace
      db/          Schema、迁移、seed
      domain/      定价、库存、信用、状态机、权限、幂等、确认令牌、审批、优先级、作战室、跟进、订单
      eval/        Agent golden cases 评测入口
      gateway/     OpenAI 兼容网关、SSE
      rag/         切块、n-gram 向量、入库、混合检索
      routes/      chat / confirmations / approvals / business / workspace / customers / orders / tickets …
      tools/       14 个工具（9 读 + 5 写）与注册表
  web/             React + Vite + Tailwind
    src/
      api/         REST / SSE 客户端
      components/  对话流、执行链路、确认/审批卡、业务弹窗
      pages/       作战室、客户、商机、报价、订单、售后、审批、审计
      state/       Zustand 状态
packages/shared/   Zod schema、类型、错误码、工具契约
providers/         LiteLLM 配置与多厂商接入说明
knowledge/         企业政策 / FAQ / 合同 Markdown
evals/             golden-cases.json
scripts/           smoke.sh、demo-tunnel.mjs
docs/              架构、API、AI 记录、ADR、评测、演示、PPT 提纲
```

## Docker

```bash
docker compose up --build
```

- 单容器：构建 shared/server/web，生产模式下由 Fastify 同时托管 API 与 `web/dist`。
- SQLite 数据卷：`./data:/app/data`。
- 健康检查：容器内请求 `http://127.0.0.1:3000/health`。
- 默认 Mock 模式，可用 `LLM_PROVIDER=qwen docker compose up` 等覆盖。

> 本机未安装 Docker，镜像构建与 compose 启动尚未实际验证；生产模式已通过 `pnpm build` + `node apps/server/dist/index.js` 验证。

## 已知限制

- 演示身份切换代替真实登录/SSO，不构成生产级认证。
- 不接真实支付、发票、物流、ERP / IM。
- Embedding 为本地离线 n-gram 哈希向量，后续可替换为 OpenAI 兼容 embedding。
- 产品目录与价格规则暂未提供管理界面（定价仍由服务端规则计算）。
- `POST /api/demo/reset` 仅在 `DEMO_MODE=true` 时开放。
