import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  AppError,
  type Actor,
  type CreateOpportunityInput,
  type FollowUpType,
  type OpportunityStage,
  type RiskLevel,
} from "@salespilot/shared";
import type { Db } from "../db/client.js";
import { customers, followUps, opportunities } from "../db/schema.js";
import { scopedOwnerIds } from "../lib/actor.js";

export interface RecordFollowUpInput {
  customerId: string;
  opportunityId?: string;
  type: FollowUpType;
  content: string;
  result?: string;
  nextAction?: string;
  nextActionDueAt?: number;
}

export interface UpdateOpportunityInput {
  stage?: OpportunityStage;
  probability?: number;
  riskLevel?: RiskLevel;
  nextAction?: string | null;
  nextActionDueAt?: number | null;
  amountCents?: number;
  expectedCloseDate?: number;
}

function assertOpportunityAccess(db: Db, actor: Actor, opportunityId: string, customerId: string) {
  const opportunity = db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).get();
  if (!opportunity) throw new AppError("NOT_FOUND", "商机不存在");
  if (opportunity.customerId !== customerId) throw new AppError("VALIDATION_ERROR", "商机不属于该客户");
  if (!scopedOwnerIds(db, actor).includes(opportunity.ownerId)) throw new AppError("FORBIDDEN", "无权操作该商机");
  return opportunity;
}

export function recordFollowUp(db: Db, actor: Actor, input: RecordFollowUpInput) {
  const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
  if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
  if (!scopedOwnerIds(db, actor).includes(customer.ownerId)) throw new AppError("FORBIDDEN", "无权操作该客户");
  if (input.opportunityId) assertOpportunityAccess(db, actor, input.opportunityId, input.customerId);
  const now = Date.now();
  const id = `f_${randomUUID()}`;
  db.transaction((tx) => {
    tx.insert(followUps)
      .values({
        id,
        customerId: input.customerId,
        opportunityId: input.opportunityId ?? null,
        actorId: actor.id,
        type: input.type,
        content: input.content,
        result: input.result ?? null,
        nextAction: input.nextAction ?? null,
        nextActionDueAt: input.nextActionDueAt ?? null,
        createdAt: now,
      })
      .run();
    if (input.opportunityId) {
      tx.update(opportunities)
        .set({
          lastFollowUpAt: now,
          nextAction: input.nextAction ?? undefined,
          nextActionDueAt: input.nextActionDueAt ?? undefined,
          updatedAt: now,
        })
        .where(eq(opportunities.id, input.opportunityId))
        .run();
    }
  });
  return { followUp: { id, ...input, actorId: actor.id, createdAt: now } };
}

export function createOpportunity(db: Db, actor: Actor, input: CreateOpportunityInput) {
  const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
  if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
  if (!scopedOwnerIds(db, actor).includes(customer.ownerId)) {
    throw new AppError("FORBIDDEN", "无权为该客户创建商机");
  }
  const now = Date.now();
  const id = `o_${randomUUID()}`;
  db.insert(opportunities)
    .values({
      id,
      customerId: input.customerId,
      ownerId: customer.ownerId,
      name: input.name,
      amountCents: input.amountCents,
      stage: input.stage,
      probability: input.probability,
      expectedCloseDate: input.expectedCloseDate,
      nextAction: input.nextAction ?? null,
      nextActionDueAt: input.nextActionDueAt ?? null,
      riskLevel: input.riskLevel,
      lastFollowUpAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return db.select().from(opportunities).where(eq(opportunities.id, id)).get()!;
}

export function updateOpportunity(db: Db, actor: Actor, opportunityId: string, patch: UpdateOpportunityInput) {
  const opportunity = db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).get();
  if (!opportunity) throw new AppError("NOT_FOUND", "商机不存在");
  if (!scopedOwnerIds(db, actor).includes(opportunity.ownerId)) throw new AppError("FORBIDDEN", "无权操作该商机");
  if (patch.probability !== undefined && (patch.probability < 0 || patch.probability > 100)) {
    throw new AppError("VALIDATION_ERROR", "成交概率必须在 0–100 之间");
  }
  const now = Date.now();
  db.update(opportunities)
    .set({
      stage: patch.stage ?? undefined,
      probability: patch.probability ?? undefined,
      riskLevel: patch.riskLevel ?? undefined,
      nextAction: patch.nextAction === undefined ? undefined : patch.nextAction,
      nextActionDueAt: patch.nextActionDueAt === undefined ? undefined : patch.nextActionDueAt,
      amountCents: patch.amountCents ?? undefined,
      expectedCloseDate: patch.expectedCloseDate ?? undefined,
      updatedAt: now,
    })
    .where(eq(opportunities.id, opportunityId))
    .run();
  return db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).get()!;
}
