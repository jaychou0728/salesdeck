import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ok, type Actor, type TraceEvent } from "@salespilot/shared";
import { auditLogs } from "../db/schema.js";
import { seedDatabase } from "../db/seed.js";
import { makeTestDb } from "../test/helpers.js";
import { executeTool } from "./registry.js";
import { searchCustomers } from "./read/searchCustomers.js";
import type { ToolDefinition } from "./types.js";

const sales: Actor = { id: "u_sales_lin", name: "小林", role: "sales", teamId: "team_east" };

function ctx(actor: Actor = sales) {
  const { db, sqlite } = makeTestDb();
  seedDatabase(db);
  const events: TraceEvent[] = [];
  return { db, sqlite, actor, traceId: "t_registry", emit: (event: TraceEvent) => events.push(event), events };
}

describe("tool registry", () => {
  it("audits validation failures", async () => {
    const c = ctx();
    const result = await executeTool(searchCustomers, c, { query: "" });
    expect(result.model.ok).toBe(false);
    if (!result.model.ok) expect(result.model.error.code).toBe("VALIDATION_ERROR");

    const audits = c.db.select().from(auditLogs).all();
    expect(audits.some((row) => row.toolName === "search_customers" && row.status === "error")).toBe(true);
  });

  it("audits role denials", async () => {
    const c = ctx();
    const managerOnly: ToolDefinition<{ q: string }, { done: boolean }> = {
      name: "manager_only_tool",
      description: "只有经理可执行",
      inputSchema: z.object({ q: z.string().min(1) }),
      kind: "read",
      allowedRoles: ["manager"],
      execute() {
        return { model: ok({ done: true }) };
      },
    };

    const result = await executeTool(managerOnly, c, { q: "hello" });
    expect(result.model.ok).toBe(false);
    if (!result.model.ok) expect(result.model.error.code).toBe("FORBIDDEN");

    const audits = c.db.select().from(auditLogs).all();
    expect(audits.some((row) => row.toolName === "manager_only_tool" && row.status === "error")).toBe(true);
  });

  it("redacts secrets from step.start but keeps artifact payload", async () => {
    const c = ctx();
    const secretTool: ToolDefinition<{ confirmationToken: string; idempotencyKey: string }, { done: boolean }> = {
      name: "secret_tool",
      description: "带确认令牌返回产物",
      inputSchema: z.object({ confirmationToken: z.string(), idempotencyKey: z.string() }),
      kind: "read",
      allowedRoles: ["sales"],
      execute() {
        return {
          model: ok({ done: true }),
          artifacts: [
            {
              kind: "quote",
              title: "preview",
              payload: { ok: true },
              confirmationToken: "tok_secret",
            },
          ],
        };
      },
    };

    const result = await executeTool(secretTool, c, {
      confirmationToken: "tok_secret",
      idempotencyKey: "idem_secret",
    });
    expect(result.model.ok).toBe(true);

    const start = c.events.find((event) => event.type === "step.start");
    expect(start).toBeDefined();
    expect(JSON.stringify(start)).not.toContain("tok_secret");
    expect(JSON.stringify(start)).not.toContain("idem_secret");

    const artifact = c.events.find((event) => event.type === "artifact");
    expect(artifact).toBeDefined();
    expect(JSON.stringify(artifact)).toContain("tok_secret");

    expect(c.events.some((event) => event.type === "step.end")).toBe(true);

    const audit = c.db.select().from(auditLogs).all().find((row) => row.toolName === "secret_tool");
    expect(audit).toBeDefined();
    expect(audit!.argsJson).not.toContain("tok_secret");
    expect(audit!.argsJson).not.toContain("idem_secret");
  });
});
