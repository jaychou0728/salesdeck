import type { FastifyInstance } from "fastify";
import type { ChatProvider } from "../agent/provider.js";

export function registerOpenAiGateway(app: FastifyInstance, provider: ChatProvider) {
  app.after(() => {
    app.post(
      "/v1/chat/completions",
      {
        attachValidation: true,
        schema: {
          tags: ["gateway"],
          summary: "OpenAI-compatible chat completions with tools and SSE passthrough",
          body: {
            type: "object",
            required: ["messages"],
            properties: {
              model: { type: "string" },
              messages: { type: "array", items: { type: "object" } },
              tools: { type: "array", items: { type: "object" } },
              stream: { type: "boolean" },
            },
          },
          response: {
            200: { type: "object", additionalProperties: true },
            400: { type: "object", additionalProperties: true },
            502: { type: "object", additionalProperties: true },
          },
        },
      },
      async (request, reply) => {
        const body = request.body as {
          model?: string;
          messages?: unknown[];
          tools?: unknown[];
          stream?: boolean;
        };
        if (!Array.isArray(body?.messages)) {
          return reply.code(400).send({ error: { message: "messages is required", type: "invalid_request_error", code: "VALIDATION_ERROR" } });
        }
        try {
          const result = await provider.chat({
            messages: body.messages as never,
            tools: body.tools,
            stream: body.stream,
          });
          if (body.stream) {
            reply.hijack();
            reply.raw.writeHead(200, {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
            });
            for await (const chunk of result as AsyncIterable<unknown>) {
              reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
            reply.raw.write("data: [DONE]\n\n");
            reply.raw.end();
            return;
          }
          return reply.send(result);
        } catch (error) {
          return reply.code(502).send({ error: { message: error instanceof Error ? error.message : "provider error", type: "provider_error", code: "PROVIDER_ERROR" } });
        }
      },
    );
  });
}
