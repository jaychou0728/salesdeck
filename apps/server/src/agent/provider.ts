export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string | null; tool_calls?: OpenAiToolCall[] };
    finish_reason: "stop" | "tool_calls";
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface ChatProvider {
  name: string;
  chat(request: { messages: ChatMessage[]; tools?: unknown[]; stream?: boolean }): Promise<ChatResponse | AsyncIterable<unknown>>;
}

export function textResponse(content: string, model = "mock"): ChatResponse {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Date.now(),
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export function toolResponse(name: string, args: unknown, model = "mock"): ChatResponse {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Date.now(),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: `call_${Math.random().toString(36).slice(2)}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export async function* streamResponse(response: ChatResponse) {
  yield {
    id: response.id,
    object: "chat.completion.chunk",
    created: response.created,
    model: response.model,
    choices: [{ index: 0, delta: { role: "assistant", content: response.choices[0].message.content, tool_calls: response.choices[0].message.tool_calls }, finish_reason: response.choices[0].finish_reason }],
  };
}
