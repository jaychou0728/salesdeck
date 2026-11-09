import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { AppError } from "@salesdeck/shared";
import type { Db } from "../db/client.js";
import { idempotencyKeys } from "../db/schema.js";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
  return `{${entries.join(",")}}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function withIdempotency<T>(
  db: Db,
  input: { key: string; actorId: string; toolName: string; request: unknown },
  fn: () => T,
): { value: T; replayed: boolean } {
  const requestHash = sha256(stableStringify(input.request));
  return db.transaction((tx) => {
    const existing = tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, input.key)).get();
    if (existing) {
      if (existing.actorId !== input.actorId || existing.toolName !== input.toolName || existing.requestHash !== requestHash) {
        throw new AppError("CONFLICT", "幂等键已被其他请求使用");
      }
      return { value: JSON.parse(existing.responseJson) as T, replayed: true };
    }
    const value = fn();
    if (isThenable(value)) {
      throw new AppError("VALIDATION_ERROR", "withIdempotency 只接受同步回调");
    }
    tx.insert(idempotencyKeys)
      .values({
        key: input.key,
        actorId: input.actorId,
        toolName: input.toolName,
        requestHash,
        responseJson: JSON.stringify(value),
        status: "completed",
        createdAt: Date.now(),
      })
      .run();
    return { value, replayed: false };
  });
}
