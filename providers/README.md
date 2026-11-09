# 模型接入（多厂商）

SalesDeck 的服务端只依赖 **OpenAI 兼容协议**，因此可以接任意厂商，不需要为每家写一套 SDK。

## 方式一：直接配置供应商（推荐，最少依赖）

在 `.env` 中设置：

```env
LLM_PROVIDER=qwen
DASHSCOPE_API_KEY=sk-xxx
LLM_MODEL=qwen-plus        # 可选，覆盖预设
```

内置预设：

| `LLM_PROVIDER` | 默认端点 | 默认模型 | Key 变量 |
|---|---|---|---|
| `deepseek` | `https://api.deepseek.com` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| `openai` | `https://api.openai.com/v1` | `gpt-4o-mini` | `OPENAI_API_KEY` |
| `qwen` | 阿里云百炼兼容端点 | `qwen-plus` | `DASHSCOPE_API_KEY` |
| `kimi` | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | `MOONSHOT_API_KEY` |
| `zhipu` | 智谱 open.bigmodel.cn | `glm-4-flash` | `ZHIPU_API_KEY` |
| `siliconflow` | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V3` | `SILICONFLOW_API_KEY` |
| `openrouter` | `https://openrouter.ai/api/v1` | `openrouter/auto` | `OPENROUTER_API_KEY` |
| `groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| `ollama` | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` | 无需 Key |
| `litellm` | `http://127.0.0.1:4000/v1` | 由 `LLM_MODEL` 指定 | `LITELLM_MASTER_KEY` |

任意其他 OpenAI 兼容端点：

```env
LLM_PROVIDER=internal
LLM_BASE_URL=https://llm.internal/v1
LLM_API_KEY=sk-internal
LLM_MODEL=internal-chat
```

`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 的优先级高于预设，可用于接代理或自建网关。

## 方式二：LiteLLM 代理（Python 库，统一多厂商）

[LiteLLM](https://github.com/BerriAI/litellm) 是一个 Python 库，提供 OpenAI 兼容的代理，覆盖 100+ 模型供应商。

```bash
python -m pip install -r providers/requirements.txt

# Git Bash / PowerShell 各自导出需要的 Key，例如
export DEEPSEEK_API_KEY=sk-xxx
export DASHSCOPE_API_KEY=sk-yyy
export LITELLM_MASTER_KEY=sk-salesdeck

litellm --config providers/litellm.config.yaml --port 4000
```

然后在 `.env` 中把 SalesDeck 指向代理：

```env
LLM_PROVIDER=litellm
LLM_MODEL=qwen-plus        # 对应 litellm.config.yaml 的 model_name
LITELLM_MASTER_KEY=sk-salesdeck
```

验证：

```bash
curl -s http://127.0.0.1:4000/v1/models \
  -H "Authorization: Bearer sk-salesdeck"

curl -s http://127.0.0.1:3000/health
# {"ok":true,"provider":"litellm"}
```

## 模型透传

`POST /v1/chat/completions` 支持请求体里的 `model` 字段；不传时使用 `LLM_MODEL`。业务 Agent 默认使用 `.env` 中配置的模型。

## 降级规则

- `LLM_PROVIDER=mock` 或未配置任何 Key：使用确定性 Mock，离线也能完整演示。
- 配置了非 mock 但缺少 Base URL / Key / 模型：服务端启动日志会打印明确原因并降级为 Mock，`/health` 返回 `provider: "mock"`。
