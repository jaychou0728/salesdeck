import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyStatic from "@fastify/static";
import type { Db } from "./db/client.js";
import type Database from "better-sqlite3";
import type { ChatProvider } from "./agent/provider.js";
import { registerHealth } from "./routes/health.js";
import { registerOpenAiGateway } from "./gateway/openai.js";
import { registerChat } from "./routes/chat.js";
import { registerConfirmations } from "./routes/confirmations.js";
import { registerApprovals } from "./routes/approvals.js";
import { registerBriefing } from "./routes/briefing.js";
import { registerBusiness } from "./routes/business.js";
import { registerWorkspace } from "./routes/workspace.js";
import { registerFollowUps } from "./routes/followUps.js";
import { registerCreditLimits } from "./routes/creditLimits.js";
import { registerCustomers } from "./routes/customers.js";
import { registerTickets } from "./routes/tickets.js";
import { registerOrders } from "./routes/orders.js";
import { registerConversations } from "./routes/conversations.js";
import { registerTraces } from "./routes/traces.js";
import { registerDemo } from "./routes/demo.js";

export function buildApp(deps: { db: Db; sqlite: Database.Database; provider: ChatProvider }) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  // Optional gate for public demos: DEMO_BASIC_AUTH="user:password".
  // Browser handles the credential prompt; /health stays open for tunnel checks.
  const demoAuth = process.env.DEMO_BASIC_AUTH?.trim();
  if (demoAuth) {
    const expected = Buffer.from(`Basic ${Buffer.from(demoAuth).toString("base64")}`);
    app.addHook("onRequest", async (request, reply) => {
      if (request.url === "/health" || request.method === "OPTIONS") return;
      const provided = Buffer.from(request.headers.authorization ?? "");
      if (provided.length === expected.length && timingSafeEqual(provided, expected)) return;
      return reply
        .code(401)
        .header("WWW-Authenticate", 'Basic realm="SalesDeck"')
        .send({ ok: false, error: { code: "FORBIDDEN", message: "需要演示访问密码" } });
    });
  }

  app.register(cors, { origin: true });
  app.register(swagger, { openapi: { info: { title: "SalesDeck API", version: "0.1.0" } } });
  app.register(swaggerUi, { routePrefix: "/docs" });
  registerHealth(app, deps.provider.name);
  registerOpenAiGateway(app, deps.provider);
  registerChat(app, deps);
  registerConfirmations(app, deps);
  registerApprovals(app, deps);
  registerBriefing(app, deps);
  registerBusiness(app, deps);
  registerWorkspace(app, deps);
  registerFollowUps(app, deps);
  registerCreditLimits(app, deps);
  registerCustomers(app, deps);
  registerTickets(app, deps);
  registerOrders(app, deps);
  registerConversations(app, deps);
  registerTraces(app, deps);
  registerDemo(app, deps);
  if (process.env.NODE_ENV === "production") {
    const webRoot = path.resolve(import.meta.dirname, "../../web/dist");
    app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api") || request.url.startsWith("/v1")) return reply.code(404).send({ ok: false });
      return reply.sendFile("index.html");
    });
  }
  return app;
}
