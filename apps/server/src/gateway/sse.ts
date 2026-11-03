import type { FastifyReply } from "fastify";

export function openSse(reply: FastifyReply) {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  let seq = 0;
  return {
    send(event: string, data: unknown) {
      seq += 1;
      reply.raw.write(`id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      reply.raw.end();
    },
  };
}
