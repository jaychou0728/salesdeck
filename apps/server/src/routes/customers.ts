import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { AppError } from "@salesdeck/shared";
import type Database from "better-sqlite3";
import type { Db } from "../db/client.js";
import { approvals, auditLogs, contacts, customers, users } from "../db/schema.js";
import { resolveActor, scopedOwnerIds, teamOwnerIds } from "../lib/actor.js";
import { assertManager } from "../domain/permissions.js";

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
};

const CUSTOMER_CREATE = z.object({
  name: z.string().min(1).max(100),
  industry: z.string().min(1).max(60),
  region: z.string().min(1).max(60),
  paymentTerms: z.string().min(1).max(50),
  level: z.enum(["A", "B", "C"]).optional(),
  ownerId: z.string().min(1).optional(),
  creditLimitCents: z.number().int().nonnegative().optional(),
});

const CUSTOMER_PATCH = z
  .object({
    name: z.string().min(1).max(100).optional(),
    industry: z.string().min(1).max(60).optional(),
    level: z.enum(["A", "B", "C"]).optional(),
    region: z.string().min(1).max(60).optional(),
    paymentTerms: z.string().min(1).max(50).optional(),
    ownerId: z.string().min(1).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "没有需要更新的字段" });

const CREDIT_LIMIT_PATCH = z.object({
  limitCents: z.number().int().nonnegative(),
  reason: z.string().min(2).max(200),
});

const CONTACT_CREATE = z.object({
  name: z.string().min(1).max(50),
  title: z.string().min(1).max(50),
  phone: z.string().max(30).default(""),
  email: z.string().max(100).default(""),
  isPrimary: z.boolean().optional(),
});

const CONTACT_PATCH = z
  .object({
    name: z.string().min(1).max(50).optional(),
    title: z.string().min(1).max(50).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().max(100).optional(),
    isPrimary: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "没有需要更新的字段" });

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.code(ERROR_STATUS[error.code] ?? 400).send({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details, suggestedAction: error.suggestedAction },
    });
  }
  return reply.code(500).send({ ok: false, error: { code: "PROVIDER_ERROR", message: "服务器内部错误" } });
}

function handle(fn: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> | unknown) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(request, reply);
    } catch (error) {
      return sendError(reply, error);
    }
  };
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请求参数不合法", parsed.error.issues);
  return parsed.data;
}

function writeAudit(db: Db, actorId: string, toolName: string, args: unknown, result: unknown) {
  db.insert(auditLogs)
    .values({
      id: `audit_${randomUUID()}`,
      traceId: `manual_${toolName}_${randomUUID()}`,
      actorId,
      toolName,
      argsJson: JSON.stringify(args),
      resultJson: JSON.stringify(result),
      status: "ok",
      latencyMs: 0,
      createdAt: Date.now(),
    })
    .run();
}

export function registerCustomers(app: FastifyInstance, deps: { db: Db; sqlite: Database.Database }) {
  const actorOf = (request: FastifyRequest) => resolveActor(deps.db, request);

  const scopedCustomer = (actorId: string, id: string) => {
    const actor = deps.db.select().from(users).where(eq(users.id, actorId)).get();
    if (!actor) throw new AppError("FORBIDDEN", "未知用户");
    const customer = deps.db.select().from(customers).where(eq(customers.id, id)).get();
    if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
    if (!scopedOwnerIds(deps.db, actor).includes(customer.ownerId)) {
      throw new AppError("FORBIDDEN", "无权操作该客户");
    }
    return { actor, customer };
  };

  app.after(() => {
    app.post(
      "/api/business/customers",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Create a customer (sales: self-owned defaults / manager: assign owner, level and limit)",
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const input = parseBody(CUSTOMER_CREATE, request.body);

        if (actor.role !== "manager") {
          if (input.ownerId && input.ownerId !== actor.id) {
            throw new AppError("FORBIDDEN", "销售只能创建本人名下的客户");
          }
          if ((input.level && input.level !== "C") || (input.creditLimitCents ?? 0) > 0) {
            throw new AppError("FORBIDDEN", "客户等级与初始信用额度仅经理可设置");
          }
        }
        let ownerId = actor.role === "manager" ? input.ownerId ?? actor.id : actor.id;
        if (input.ownerId) {
          const owner = deps.db.select().from(users).where(eq(users.id, input.ownerId)).get();
          if (!owner || owner.teamId !== actor.teamId || owner.role !== "sales") {
            throw new AppError("VALIDATION_ERROR", "负责人必须是本团队的销售");
          }
          ownerId = input.ownerId;
        }
        if (actor.role === "manager" && ownerId === actor.id) {
          const firstSales = deps.db
            .select()
            .from(users)
            .where(and(eq(users.teamId, actor.teamId), eq(users.role, "sales")))
            .get();
          if (!firstSales) throw new AppError("VALIDATION_ERROR", "团队中没有可分配客户的销售");
          ownerId = firstSales.id;
        }

        const customerId = `c_${randomUUID()}`;
        deps.db.insert(customers)
          .values({
            id: customerId,
            name: input.name,
            industry: input.industry,
            level: input.level ?? "C",
            ownerId,
            region: input.region,
            creditLimitCents: input.creditLimitCents ?? 0,
            creditUsedCents: 0,
            paymentTerms: input.paymentTerms,
            status: "active",
          })
          .run();
        const created = deps.db.select().from(customers).where(eq(customers.id, customerId)).get()!;
        writeAudit(deps.db, actor.id, "create_customer", input, created);
        return { ok: true, customer: created };
      }),
    );

    app.get(
      "/api/business/team-members",
      { schema: { tags: ["business"], summary: "Team members available as customer owners (manager only)" } },
      handle(async (request) => {
        const actor = actorOf(request);
        assertManager(actor);
        const rows = deps.db
          .select({ id: users.id, name: users.name, role: users.role, teamId: users.teamId })
          .from(users)
          .where(eq(users.teamId, actor.teamId))
          .all();
        return { ok: true, members: rows };
      }),
    );

    app.patch(
      "/api/business/customers/:id",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Update customer master data (sales: own customers / manager: team customers)",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const { customer } = scopedCustomer(actor.id, id);
        const input = parseBody(CUSTOMER_PATCH, request.body);

        if (actor.role !== "manager") {
          const managerOnly = ["level", "ownerId", "status"].filter((key) => key in input);
          if (managerOnly.length > 0) {
            throw new AppError("FORBIDDEN", "客户等级、负责人与状态仅经理可修改");
          }
        }
        if (input.ownerId) {
          const owner = deps.db.select().from(users).where(eq(users.id, input.ownerId)).get();
          if (!owner || owner.teamId !== actor.teamId || owner.role !== "sales") {
            throw new AppError("VALIDATION_ERROR", "负责人必须是本团队的销售");
          }
        }

        const patch: {
          name?: string;
          industry?: string;
          level?: "A" | "B" | "C";
          region?: string;
          paymentTerms?: string;
          ownerId?: string;
          status?: string;
        } = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.industry !== undefined) patch.industry = input.industry;
        if (input.level !== undefined) patch.level = input.level;
        if (input.region !== undefined) patch.region = input.region;
        if (input.paymentTerms !== undefined) patch.paymentTerms = input.paymentTerms;
        if (input.ownerId !== undefined) patch.ownerId = input.ownerId;
        if (input.status !== undefined) patch.status = input.status;
        deps.db.update(customers).set(patch).where(eq(customers.id, customer.id)).run();
        const updated = deps.db.select().from(customers).where(eq(customers.id, customer.id)).get()!;
        writeAudit(deps.db, actor.id, "update_customer", { customerId: customer.id, patch }, updated);
        return { ok: true, customer: updated };
      }),
    );

    app.patch(
      "/api/business/customers/:id/credit-limit",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Directly set a customer credit limit (manager only)",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        assertManager(actor);
        const { id } = request.params as { id: string };
        const customer = deps.db.select().from(customers).where(eq(customers.id, id)).get();
        if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
        if (!teamOwnerIds(deps.db, actor).includes(customer.ownerId)) {
          throw new AppError("FORBIDDEN", "无权调整该客户额度");
        }
        const input = parseBody(CREDIT_LIMIT_PATCH, request.body);
        if (input.limitCents < customer.creditUsedCents) {
          throw new AppError(
            "VALIDATION_ERROR",
            `额度不能低于已用额度（${(customer.creditUsedCents / 100).toLocaleString("zh-CN")} 元）`,
            { creditUsedCents: customer.creditUsedCents, requestedLimitCents: input.limitCents },
          );
        }

        deps.db.transaction((tx) => {
          tx.update(customers)
            .set({ creditLimitCents: input.limitCents })
            .where(eq(customers.id, customer.id))
            .run();
          // Direct edits supersede outstanding increase requests, otherwise a later
          // approval could overwrite the manager's latest decision.
          tx.update(approvals)
            .set({
              status: "rejected",
              approverId: actor.id,
              comment: "经理已直接调整额度",
              decidedAt: Date.now(),
            })
            .where(
              and(
                eq(approvals.targetType, "customer"),
                eq(approvals.targetId, customer.id),
                eq(approvals.type, "credit_limit"),
                eq(approvals.status, "pending"),
              ),
            )
            .run();
        });
        writeAudit(
          deps.db,
          actor.id,
          "update_credit_limit",
          { customerId: customer.id, previousLimitCents: customer.creditLimitCents, reason: input.reason },
          { creditLimitCents: input.limitCents },
        );
        return { ok: true, creditLimitCents: input.limitCents };
      }),
    );

    app.post(
      "/api/business/customers/:id/contacts",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Add a contact to a scoped customer",
          params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { id } = request.params as { id: string };
        const { customer } = scopedCustomer(actor.id, id);
        const input = parseBody(CONTACT_CREATE, request.body);
        const contactId = `ct_${randomUUID()}`;
        deps.db.transaction((tx) => {
          if (input.isPrimary) {
            tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.customerId, customer.id)).run();
          }
          tx.insert(contacts)
            .values({
              id: contactId,
              customerId: customer.id,
              name: input.name,
              title: input.title,
              phone: input.phone,
              email: input.email,
              isPrimary: input.isPrimary ?? false,
            })
            .run();
        });
        const contact = deps.db.select().from(contacts).where(eq(contacts.id, contactId)).get()!;
        writeAudit(deps.db, actor.id, "create_contact", { customerId: customer.id, ...input }, contact);
        return { ok: true, contact };
      }),
    );

    app.patch(
      "/api/business/contacts/:contactId",
      {
        attachValidation: true,
        schema: {
          tags: ["business"],
          summary: "Update a contact of a scoped customer",
          params: { type: "object", required: ["contactId"], properties: { contactId: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { contactId } = request.params as { contactId: string };
        const contact = deps.db.select().from(contacts).where(eq(contacts.id, contactId)).get();
        if (!contact) throw new AppError("NOT_FOUND", "联系人不存在");
        scopedCustomer(actor.id, contact.customerId);
        const input = parseBody(CONTACT_PATCH, request.body);
        deps.db.transaction((tx) => {
          if (input.isPrimary) {
            tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.customerId, contact.customerId)).run();
          }
          tx.update(contacts).set(input).where(eq(contacts.id, contact.id)).run();
        });
        const updated = deps.db.select().from(contacts).where(eq(contacts.id, contact.id)).get()!;
        writeAudit(deps.db, actor.id, "update_contact", { contactId: contact.id, patch: input }, updated);
        return { ok: true, contact: updated };
      }),
    );

    app.delete(
      "/api/business/contacts/:contactId",
      {
        schema: {
          tags: ["business"],
          summary: "Delete a contact of a scoped customer",
          params: { type: "object", required: ["contactId"], properties: { contactId: { type: "string" } } },
        },
      },
      handle(async (request) => {
        const actor = actorOf(request);
        const { contactId } = request.params as { contactId: string };
        const contact = deps.db.select().from(contacts).where(eq(contacts.id, contactId)).get();
        if (!contact) throw new AppError("NOT_FOUND", "联系人不存在");
        scopedCustomer(actor.id, contact.customerId);
        deps.db.transaction((tx) => {
          tx.delete(contacts).where(eq(contacts.id, contact.id)).run();
          if (contact.isPrimary) {
            const next = tx.select().from(contacts).where(eq(contacts.customerId, contact.customerId)).get();
            if (next) tx.update(contacts).set({ isPrimary: true }).where(eq(contacts.id, next.id)).run();
          }
        });
        writeAudit(deps.db, actor.id, "delete_contact", { contactId: contact.id }, { deleted: true });
        return { ok: true };
      }),
    );
  });
}
