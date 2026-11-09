import OpenAI from "openai";
import { MockProvider } from "./mockProvider.js";
import type { ChatMessage, ChatProvider } from "./provider.js";

interface ProviderPreset {
  baseURL: string;
  envKeys: string[];
  model?: string;
  dummyKey?: string;
}

export interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

/**
 * Any OpenAI-compatible endpoint works: direct vendor APIs or a LiteLLM proxy.
 * Presets only supply defaults; LLM_BASE_URL / LLM_API_KEY / LLM_MODEL always win.
 */
const PRESETS: Record<string, ProviderPreset> = {
  deepseek: {
    baseURL: "https://api.deepseek.com",
    envKeys: ["DEEPSEEK_API_KEY"],
    model: "deepseek-chat",
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    envKeys: ["OPENAI_API_KEY"],
    model: "gpt-4o-mini",
  },
  qwen: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    envKeys: ["DASHSCOPE_API_KEY"],
    model: "qwen-plus",
  },
  kimi: {
    baseURL: "https://api.moonshot.cn/v1",
    envKeys: ["MOONSHOT_API_KEY"],
    model: "moonshot-v1-8k",
  },
  zhipu: {
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    envKeys: ["ZHIPU_API_KEY"],
    model: "glm-4-flash",
  },
  siliconflow: {
    baseURL: "https://api.siliconflow.cn/v1",
    envKeys: ["SILICONFLOW_API_KEY"],
    model: "deepseek-ai/DeepSeek-V3",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    envKeys: ["OPENROUTER_API_KEY"],
    model: "openrouter/auto",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    envKeys: ["GROQ_API_KEY"],
    model: "llama-3.3-70b-versatile",
  },
  ollama: {
    baseURL: "http://127.0.0.1:11434/v1",
    envKeys: [],
    model: "qwen2.5:7b",
    dummyKey: "ollama",
  },
  litellm: {
    baseURL: "http://127.0.0.1:4000/v1",
    envKeys: ["LITELLM_MASTER_KEY"],
    dummyKey: "sk-litellm",
  },
};

function parseHeaders(value: string | undefined): Record<string, string> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const headers = Object.fromEntries(
      Object.entries(parsed)
        .filter(([, header]) => typeof header === "string")
        .map(([key, header]) => [key, header as string]),
    );
    return Object.keys(headers).length > 0 ? headers : undefined;
  } catch {
    throw new Error("LLM_EXTRA_HEADERS 必须是 JSON 对象");
  }
}

export function resolveProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig | null {
  const requested = (env.LLM_PROVIDER ?? "").trim().toLowerCase();
  const providerName = requested || (env.DEEPSEEK_API_KEY ? "deepseek" : "mock");
  if (providerName === "mock") return null;

  const preset = PRESETS[providerName];
  const legacyBaseURL = providerName === "deepseek" ? env.DEEPSEEK_BASE_URL?.trim() : undefined;
  const baseURL = env.LLM_BASE_URL?.trim() || legacyBaseURL || preset?.baseURL;
  if (!baseURL) {
    throw new Error(
      `未知的 LLM_PROVIDER "${providerName}"：请设置 LLM_BASE_URL，或使用 ${Object.keys(PRESETS).join(" / ")}`,
    );
  }

  const apiKey =
    env.LLM_API_KEY?.trim() ||
    preset?.envKeys.map((key) => env[key]?.trim()).find(Boolean) ||
    preset?.dummyKey ||
    "";
  if (!apiKey) {
    throw new Error(
      `LLM_PROVIDER=${providerName} 缺少 API Key：请设置 LLM_API_KEY${preset && preset.envKeys.length > 0 ? ` 或 ${preset.envKeys.join(" / ")}` : ""}`,
    );
  }

  const legacyModel = providerName === "deepseek" ? env.DEEPSEEK_MODEL?.trim() : undefined;
  const model = env.LLM_MODEL?.trim() || legacyModel || preset?.model;
  if (!model) {
    throw new Error(`LLM_PROVIDER=${providerName} 缺少模型名：请设置 LLM_MODEL`);
  }

  return {
    name: providerName,
    baseURL,
    apiKey,
    model,
    extraHeaders: parseHeaders(env.LLM_EXTRA_HEADERS),
  };
}

export class OpenAiCompatibleProvider implements ChatProvider {
  name: string;
  readonly model: string;
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: Number(process.env.LLM_TIMEOUT_MS ?? 30_000),
      maxRetries: 1,
      defaultHeaders: config.extraHeaders,
    });
  }

  async chat(request: { messages: ChatMessage[]; tools?: unknown[]; stream?: boolean; model?: string }) {
    const completion = await this.client.chat.completions.create({
      model: request.model ?? this.model,
      messages: request.messages as never,
      tools: request.tools as never,
      stream: request.stream ?? false,
      max_tokens: Number(process.env.LLM_MAX_TOKENS ?? 800),
    } as never);
    return completion as never;
  }
}

export function getProvider(): ChatProvider {
  try {
    const config = resolveProviderConfig();
    if (!config) return new MockProvider();
    console.log(`[SalesDeck] LLM provider: ${config.name} · ${config.model} · ${config.baseURL}`);
    return new OpenAiCompatibleProvider(config);
  } catch (error) {
    console.error(`[SalesDeck] ${error instanceof Error ? error.message : "LLM 配置错误"}；已降级为 Mock`);
    return new MockProvider();
  }
}
