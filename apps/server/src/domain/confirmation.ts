import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { AppError } from "@salespilot/shared";
import type { Db } from "../db/client.js";
import { confirmationTokens } from "../db/schema.js";
import { sha256, stableStringify } from "./idempotency.js";

const secret = process.env.CONFIRMATION_SECRET ?? "dev-secret";

function sign(value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function issueConfirmationToken(
  db: Db,
  input: { actorId: string; toolName: string; payload: unknown; ttlMs?: number },
) {
  const id = randomUUID();
  const payloadHash = sha256(stableStringify(input.payload));
  const expiresAt = Date.now() + (input.ttlMs ?? 10 * 60_000);
  const signature = sign(`${id}.${input.actorId}.${input.toolName}.${payloadHash}.${expiresAt}`);
  db.insert(confirmationTokens)
    .values({
      id,
      actorId: input.actorId,
      toolName: input.toolName,
      payloadHash,
      expiresAt,
      createdAt: Date.now(),
    })
    .run();
  return { token: `${id}.${expiresAt}.${signature}`, expiresAt };
}

export function consumeConfirmationToken(
  db: Db,
  token: string,
  input: { actorId: string; toolName: string; payload: unknown; now?: number },
) {
  const [id, expiresAtRaw, signature] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  const payloadHash = sha256(stableStringify(input.payload));
  const expected = sign(`${id}.${input.actorId}.${input.toolName}.${payloadHash}.${expiresAt}`);
  const actual = Buffer.from(signature ?? "");
  const expectedBuffer = Buffer.from(expected);
  const validSignature =
    actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  const row = db.select().from(confirmationTokens).where(eq(confirmationTokens.id, id)).get();
  const now = input.now ?? Date.now();
  if (
    !validSignature ||
    !row ||
    row.usedAt !== null ||
    row.expiresAt <= now ||
    row.actorId !== input.actorId ||
    row.toolName !== input.toolName ||
    row.payloadHash !== payloadHash
  ) {
    throw new AppError("TOKEN_EXPIRED", "确认令牌无效、已使用或已过期", undefined, false, "请重新生成预览");
  }
  const result = db
    .update(confirmationTokens)
    .set({ usedAt: now })
    .where(and(eq(confirmationTokens.id, id), isNull(confirmationTokens.usedAt)))
    .run();
  if (result.changes !== 1) {
    throw new AppError("TOKEN_EXPIRED", "确认令牌无效、已使用或已过期", undefined, false, "请重新生成预览");
  }
}
