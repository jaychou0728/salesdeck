export interface SseEvent {
  type: string;
  payload: any;
}

export async function streamChat(input: { message: string; actorId: string; conversationId?: string; onEvent: (event: SseEvent) => void }) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-id": input.actorId },
    body: JSON.stringify({ message: input.message, actorId: input.actorId, conversationId: input.conversationId }),
  });
  if (!response.ok) throw new Error(`chat failed: ${response.status}`);
  if (!response.body) throw new Error("no response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = frame.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
      const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
      if (event && data) input.onEvent({ type: event, payload: JSON.parse(data) });
    }
  }
}
