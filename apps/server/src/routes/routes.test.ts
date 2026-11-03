import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { buildApp } from "../app.js";
import { MockProvider } from "../agent/mockProvider.js";

function setup() {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  const app = buildApp({ db, sqlite, provider: new MockProvider() });
  return { app, db, sqlite };
}

describe("routes", () => {
  it("health", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
  });

  it("returns briefing alerts", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/api/briefing?scope=team", headers: { "x-actor-id": "u_manager_wang" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().alerts.length).toBeGreaterThan(0);
  });

  it("confirms a quote with a token", async () => {
    const { app } = setup();
    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { "x-actor-id": "u_sales_lin" },
      payload: { message: "给华辰设计的张总报 120 台 X1" },
    });
    const artifactLine = chat.body.split("\n").find((line) => line.startsWith("data: ") && line.includes("\"artifact\""));
    expect(artifactLine).toBeTruthy();
    const artifactEvent = JSON.parse(artifactLine!.slice(6));
    const artifact = artifactEvent.payload;
    const confirm = await app.inject({
      method: "POST",
      url: "/api/confirmations/confirm",
      headers: { "x-actor-id": "u_sales_lin" },
      payload: { token: artifact.confirmationToken, toolName: "create_quote", payload: artifact.payload.input, idempotencyKey: "idem-confirm-1" },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().ok).toBe(true);
  });
});
