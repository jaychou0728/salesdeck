import { describe, expect, it } from "vitest";
import { resolveProviderConfig } from "./openaiProvider.js";

describe("openai-compatible provider config", () => {
  it("defaults to mock with no keys", () => {
    expect(resolveProviderConfig({})).toBeNull();
    expect(resolveProviderConfig({ LLM_PROVIDER: "mock", DEEPSEEK_API_KEY: "x" })).toBeNull();
  });

  it("uses the deepseek preset and env overrides", () => {
    expect(resolveProviderConfig({ LLM_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "sk-deepseek" })).toMatchObject({
      name: "deepseek",
      baseURL: "https://api.deepseek.com",
      apiKey: "sk-deepseek",
      model: "deepseek-chat",
    });
    expect(
      resolveProviderConfig({
        LLM_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: "sk-deepseek",
        LLM_BASE_URL: "https://proxy.example/v1",
        LLM_MODEL: "deepseek-reasoner",
      }),
    ).toMatchObject({ baseURL: "https://proxy.example/v1", model: "deepseek-reasoner" });
  });

  it("supports direct vendor presets", () => {
    expect(resolveProviderConfig({ LLM_PROVIDER: "qwen", DASHSCOPE_API_KEY: "sk-qwen" })).toMatchObject({
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen-plus",
    });
    expect(resolveProviderConfig({ LLM_PROVIDER: "kimi", MOONSHOT_API_KEY: "sk-kimi" })).toMatchObject({
      baseURL: "https://api.moonshot.cn/v1",
    });
    expect(resolveProviderConfig({ LLM_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-or" })).toMatchObject({
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  it("works with a LiteLLM proxy and custom OpenAI-compatible endpoints", () => {
    expect(
      resolveProviderConfig({
        LLM_PROVIDER: "litellm",
        LLM_MODEL: "qwen-plus",
        LITELLM_MASTER_KEY: "sk-master",
      }),
    ).toMatchObject({
      name: "litellm",
      baseURL: "http://127.0.0.1:4000/v1",
      apiKey: "sk-master",
      model: "qwen-plus",
    });
    expect(
      resolveProviderConfig({
        LLM_PROVIDER: "internal",
        LLM_BASE_URL: "https://llm.internal/v1",
        LLM_API_KEY: "sk-internal",
        LLM_MODEL: "internal-chat",
      }),
    ).toMatchObject({ name: "internal", baseURL: "https://llm.internal/v1", model: "internal-chat" });
  });

  it("surfaces actionable configuration errors", () => {
    expect(() => resolveProviderConfig({ LLM_PROVIDER: "unknown" })).toThrow(/LLM_BASE_URL/);
    expect(() => resolveProviderConfig({ LLM_PROVIDER: "openai" })).toThrow(/API Key/);
    expect(() => resolveProviderConfig({ LLM_PROVIDER: "litellm" })).toThrow(/LLM_MODEL/);
  });

  it("parses extra headers", () => {
    expect(
      resolveProviderConfig({
        LLM_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "sk-or",
        LLM_EXTRA_HEADERS: '{"HTTP-Referer":"https://example.com","X-Title":"SalesDeck"}',
      })?.extraHeaders,
    ).toEqual({ "HTTP-Referer": "https://example.com", "X-Title": "SalesDeck" });
  });
});
