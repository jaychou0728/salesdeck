import { AppError, fail } from "@salespilot/shared";
import { zodToJsonSchema } from "zod-to-json-schema";
import { auditLogs } from "../db/schema.js";
import type { ToolContext, ToolDefinition, ToolOutcome } from "./types.js";

export async function executeTool<I, O>(
  definition: ToolDefinition<I, O>,
  ctx: ToolContext,
  rawInput: unknown,
): Promise<ToolOutcome<O>> {
  const started = Date.now();
  const parsed = definition.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      model: fail("VALIDATION_ERROR", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "), {
        details: parsed.error.issues,
      }),
    };
  }
  if (!definition.allowedRoles.includes(ctx.actor.role)) {
    return { model: fail("FORBIDDEN", "当前角色不能执行该工具") };
  }

  ctx.emit({ type: "step.start", name: definition.name, payload: { input: parsed.data } });
  try {
    const outcome = await definition.execute(ctx, parsed.data);
    const latencyMs = Date.now() - started;
    if (outcome.model.ok) outcome.model.meta.latencyMs = latencyMs;
    ctx.db.insert(auditLogs)
      .values({
        id: crypto.randomUUID(),
        traceId: ctx.traceId,
        actorId: ctx.actor.id,
        toolName: definition.name,
        argsJson: JSON.stringify(parsed.data),
        resultJson: JSON.stringify(outcome.model),
        status: outcome.model.ok ? "ok" : "error",
        latencyMs,
        createdAt: Date.now(),
      })
      .run();
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
    const appError = error instanceof AppError ? error : new AppError("PROVIDER_ERROR", "工具执行失败", String(error));
    const latencyMs = Date.now() - started;
    const model = fail(appError.code, appError.message, {
      details: appError.details,
      recoverable: appError.recoverable,
      suggestedAction: appError.suggestedAction,
    });
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
