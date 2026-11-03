import { AppError, type Actor } from "@salespilot/shared";
import { eq, inArray, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { customers, users } from "../db/schema.js";

const DEFAULT_ACTOR_ID = "u_sales_lin";

export interface ActorRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function bodyActorId(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const value = (body as { actorId?: unknown }).actorId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Resolve the acting user from the `x-actor-id` header or `body.actorId`.
 * Falls back to the demo sales rep, and rejects unknown ids with FORBIDDEN.
 */
export function resolveActor(db: Db, request: ActorRequest): Actor {
  const actorId = firstHeader(request.headers["x-actor-id"]) ?? bodyActorId(request.body) ?? DEFAULT_ACTOR_ID;
  const actor = db.select().from(users).where(eq(users.id, actorId)).get();
  if (!actor) {
    throw new AppError("FORBIDDEN", "未知用户", { actorId });
  }
  return actor;
}

/** All users on the actor's team (manager scope). */
export function teamOwnerIds(db: Db, actor: Actor): string[] {
  return db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.teamId, actor.teamId))
    .all()
    .map((row) => row.id);
}

/** Owner ids the actor is allowed to see: self for sales, whole team for managers. */
export function scopedOwnerIds(db: Db, actor: Actor): string[] {
  return actor.role === "manager" ? teamOwnerIds(db, actor) : [actor.id];
}

/** SQL condition restricting customer rows to the actor's scope. */
export function customerScope(actor: Actor, db: Db): SQL {
  if (actor.role === "sales") return eq(customers.ownerId, actor.id);
  return inArray(customers.ownerId, teamOwnerIds(db, actor));
}
