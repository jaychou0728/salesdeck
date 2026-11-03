import { AppError, fail } from "@salespilot/shared";
import { zodToJsonSchema } from "zod-to-json-schema";
import { auditLogs } from "../db/schema.js";
import type { ToolContext, ToolDefinition, ToolOutcome } from "./types.js";

const REDACTED_KEYS = new Set(["confirmationToken", "idempotencyKey", "token"]);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = REDACTED_KEYS.has(key) ? "[REDACTED]" : redact(nested);
    }
    return result;
  }
  return value;
}

function writeAudit(
  ctx: ToolContext,
  definition: ToolDefinition<any, any>,
  input: unknown,
  result: unknown,
  status: "ok" | "error",
  latencyMs: number,
) {
  ctx.db
    .insert(auditLogs)
    .values({
      id: crypto.randomUUID(),
      traceId: ctx.traceId,
      actorId: ctx.actor.id,
      toolName: definition.name,
      argsJson: JSON.stringify(redact(input) ?? null),
      resultJson: JSON.stringify(result),
      status,
      latencyMs,
      createdAt: Date.now(),
    })
    .run();
}

export async function executeTool<I, O>(
  definition: ToolDefinition<I, O>,
  ctx: ToolContext,
  rawInput: unknown,
): Promise<ToolOutcome<O>> {
  const started = Date.now();
  ctx.emit({ type: "step.start", name: definition.name, payload: { input: redact(rawInput) } });

  const parsed = definition.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const latencyMs = Date.now() - started;
    const model = fail("VALIDATION_ERROR", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "), {
      details: parsed.error.issues,
    });
    writeAudit(ctx, definition, rawInput, model, "error", latencyMs);
    ctx.emit({ type: "step.end", name: definition.name, status: "error", payload: model, latencyMs });
    return { model };
  }
  if (!definition.allowedRoles.includes(ctx.actor.role)) {
    const latencyMs = Date.now() - started;
    const model = fail("FORBIDDEN", "当前角色不能执行该工具");
    writeAudit(ctx, definition, parsed.data, model, "error", latencyMs);
    ctx.emit({ type: "step.end", name: definition.name, status: "error", payload: model, latencyMs });
    return { model };
  }

  try {
    const outcome = await definition.execute(ctx, parsed.data);
    const latencyMs = Date.now() - started;
    if (outcome.model.ok) outcome.model.meta.latencyMs = latencyMs;
    writeAudit(ctx, definition, parsed.data, outcome.model, outcome.model.ok ? "ok" : "error", latencyMs);
    ctx.emit({
      type: "step.end",
      name: definition.name,
      status: outcome.model.ok ? "ok" : "error",
      payload: outcome.model,
      latencyMs,
    });
    for (const artifact of outcome.artifacts ?? []) {
      ctx.emit({ type: "artifact", name: definition.name, payload: artifact });
    }
    return outcome;
  } catch (error) {
    const latencyMs = Date.now() - started;
    const appError =
      error instanceof AppError
        ? error
        : new AppError("PROVIDER_ERROR", "工具执行失败");
    const model = fail(appError.code, appError.message, {
      details: appError.details,
      recoverable: appError.recoverable,
      suggestedAction: appError.suggestedAction,
    });
    writeAudit(ctx, definition, parsed.data, model, "error", latencyMs);
    ctx.emit({ type: "step.end", name: definition.name, status: "error", payload: model, latencyMs });
    return { model };
  }
}

export function toolSpecs(definitions: ToolDefinition<any, any>[]) {
  return definitions.map((definition) => {
    const parameters = zodToJsonSchema(definition.inputSchema, { $refStrategy: "none" }) as Record<string, unknown>;
    delete parameters.$schema;
    return {
      type: "function" as const,
      function: { name: definition.name, description: definition.description, parameters },
    };
  });
}
