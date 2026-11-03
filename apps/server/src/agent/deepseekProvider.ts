import OpenAI from "openai";
import { MockProvider } from "./mockProvider.js";
import type { ChatMessage, ChatProvider } from "./provider.js";

export class DeepSeekProvider implements ChatProvider {
  name = "deepseek";
  private client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    timeout: 30_000,
    maxRetries: 1,
  });

  async chat(request: { messages: ChatMessage[]; tools?: unknown[]; stream?: boolean }) {
    const completion = await this.client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      messages: request.messages as never,
      tools: request.tools as never,
      stream: request.stream ?? false,
    } as never);
    return completion as never;
  }
}

export function getProvider(): ChatProvider {
  return process.env.LLM_PROVIDER === "mock" || !process.env.DEEPSEEK_API_KEY
    ? new MockProvider()
    : new DeepSeekProvider();
}
