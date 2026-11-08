import { and, desc, eq, getTableColumns, gte, inArray, isNull, lt, lte, type SQL } from "drizzle-orm";
import type {
  Actor,
  OpportunityStage,
  PriorityItem,
  RiskLevel,
  TodoItem,
} from "@salespilot/shared";
import { AppError } from "@salespilot/shared";
import type { Db } from "../db/client.js";
import {
  afterSalesTickets,
  approvals,
  customers,
  followUps,
  inventory,
  opportunities,
  orders,
  quoteLines,
  quotes,
  users,
} from "../db/schema.js";
import { scopedOwnerIds, teamOwnerIds } from "../lib/actor.js";
import { endOfDayLocal, startOfDayLocal, startOfMonthLocal } from "../lib/time.js";
import { isActiveStage, scoreOpportunity, type PriorityInput } from "./priority.js";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const ACTIVE_STAGES: OpportunityStage[] = ["lead", "needs", "solution", "quote", "negotiation"];

export interface WorkspaceMetrics {
  monthSalesCents: number;
  monthTargetCents: number;
  completionRate: number;
  expectedCloseCents: number;
  activeOpportunities: number;
  highRiskOpportunities: number;
  pendingApprovals: number;
  todayFollowUps: number;
  overdueFollowUps: number;
}

export interface SalesRankingRow {
  ownerId: string;
  ownerName: string;
  monthSalesCents: number;
  pipelineCents: number;
  targetCents: number;
  completionRate: number;
  trend: "up" | "flat" | "down";
}

export interface WorkspaceTodoGroups {
  today: TodoItem[];
  overdue: TodoItem[];
  approvals: TodoItem[];
  quotesToAdvance: TodoItem[];
  quotesExpiring: TodoItem[];
  tickets: TodoItem[];
  orders: TodoItem[];
}

export interface WorkspaceData {
  scope: "self" | "team";
  actor: Actor;
  metrics: WorkspaceMetrics;
  headline: string;
  priorities: PriorityItem[];
  todos: WorkspaceTodoGroups;
  risks: PriorityItem[];
  ranking?: SalesRankingRow[];
  recentQuotes: Array<
    typeof quotes.$inferSelect & {
      customerName: string | null;
      ownerName: string | null;
      approvalStatus: string | null;
      approvalType: string | null;
    }
  >;
  recentOrders: Array<typeof orders.$inferSelect & { customerName: string | null; ownerName: string | null }>;
}

export interface CustomerAssessment {
  summary: string;
  positiveSignals: string[];
  risks: string[];
  suggestion: string;
  nextAction: string | null;
}

export interface OpportunityView {
  id: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  amountCents: number;
  stage: OpportunityStage;
  probability: number;
  expectedCloseDate: number;
  nextAction: string | null;
  nextActionDueAt: number | null;
  riskLevel: RiskLevel;
  lastFollowUpAt: number | null;
  createdAt: number;
  updatedAt: number;
  priority: PriorityItem["priority"] | null;
  score: number | null;
  reasons: string[];
  suggestedAction: string | null;
}

interface OpportunityContextRow {
  opportunity: typeof opportunities.$inferSelect;
  customerName: string;
  ownerName: string | null;
  creditLimitCents: number;
  creditUsedCents: number;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function quoteExpiringAt(quote: typeof quotes.$inferSelect | undefined, now: number) {
  if (!quote || quote.status !== "approved") return null;
  if (quote.validUntil <= now || quote.validUntil > now + 48 * HOUR_MS) return null;
  return quote.validUntil;
}

function stockShortageForQuote(db: Db, quote: typeof quotes.$inferSelect | undefined) {
  if (!quote) return false;
  const lines = db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).all();
  return lines.some((line) => {
    const rows = db.select().from(inventory).where(eq(inventory.productId, line.productId)).all();
    const available = sum(rows.map((row) => row.onHand - row.reserved));
    const safety = rows.reduce((max, row) => Math.max(max, row.safetyStock), 0);
    return available < Math.max(line.quantity, safety);
  });
}

function linkedQuote(db: Db, opportunityId: string, customerId: string) {
  const linked = db.select().from(quotes).where(eq(quotes.opportunityId, opportunityId)).orderBy(desc(quotes.createdAt)).get();
  if (linked) return linked;
  // Only fall back to a customer quote that is not bound to another opportunity.
  return db
    .select()
    .from(quotes)
    .where(and(eq(quotes.customerId, customerId), eq(quotes.status, "approved"), isNull(quotes.opportunityId)))
    .orderBy(desc(quotes.createdAt))
    .get();
}

function recentReply(db: Db, customerId: string, opportunityId: string, now: number) {
  const rows = db
    .select()
    .from(followUps)
    .where(and(eq(followUps.customerId, customerId), gte(followUps.createdAt, now - 24 * HOUR_MS)))
    .all()
    .concat(
      db
        .select()
        .from(followUps)
        .where(and(eq(followUps.opportunityId, opportunityId), gte(followUps.createdAt, now - 24 * HOUR_MS)))
        .all(),
    );
  return rows.some((row) => !!row.result && row.result.trim().length > 0);
}

function toPriorityInput(db: Db, row: OpportunityContextRow, now: number): PriorityInput {
  const quote = linkedQuote(db, row.opportunity.id, row.opportunity.customerId);
  return {
    opportunityId: row.opportunity.id,
    customerId: row.opportunity.customerId,
    customerName: row.customerName,
    ownerId: row.opportunity.ownerId,
    ownerName: row.ownerName,
    name: row.opportunity.name,
    amountCents: row.opportunity.amountCents,
    stage: row.opportunity.stage,
    probability: row.opportunity.probability,
    riskLevel: row.opportunity.riskLevel,
    nextAction: row.opportunity.nextAction,
    nextActionDueAt: row.opportunity.nextActionDueAt,
    lastFollowUpAt: row.opportunity.lastFollowUpAt,
    createdAt: row.opportunity.createdAt,
    signals: {
      creditUtilization: row.creditLimitCents > 0 ? row.creditUsedCents / row.creditLimitCents : null,
      quoteExpiringAt: quoteExpiringAt(quote, now),
      stockShortage: stockShortageForQuote(db, quote),
      recentCustomerReply: recentReply(db, row.opportunity.customerId, row.opportunity.id, now),
    },
  };
}

function loadActiveRows(db: Db, ownerIds: string[]): OpportunityContextRow[] {
  return db
    .select({
      opportunity: opportunities,
      customerName: customers.name,
      ownerName: users.name,
      creditLimitCents: customers.creditLimitCents,
      creditUsedCents: customers.creditUsedCents,
    })
    .from(opportunities)
    .innerJoin(customers, eq(opportunities.customerId, customers.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(and(inArray(opportunities.ownerId, ownerIds), inArray(opportunities.stage, ACTIVE_STAGES)))
    .all();
}

function buildHeadline(priorities: PriorityItem[]) {
  if (priorities.length === 0) return "今天没有需要紧急推进的商机，可以整理客户资料或开发新线索。";
  const top = priorities.slice(0, 3).map((item) => `${item.customerName} · ${item.name}`);
  return `今天有 ${priorities.length} 个客户值得优先推进：${top.join("、")}。`;
}

function buildTodos(
  db: Db,
  actor: Actor,
  ownerIds: string[],
  priorities: PriorityItem[],
  now: number,
): WorkspaceTodoGroups {
  const todayEnd = endOfDayLocal(now);
  const todayStart = startOfDayLocal(now);
  const todoFromPriority = (item: PriorityItem, kind: TodoItem["kind"]): TodoItem => ({
    id: `${kind}_${item.opportunityId}`,
    kind,
    title: `${item.customerName} · ${item.name}`,
    subtitle: item.suggestedAction,
    customerId: item.customerId,
    opportunityId: item.opportunityId,
    amountCents: item.amountCents,
    dueAt: item.nextActionDueAt ?? undefined,
    severity: item.priority === "P0" ? "blocker" : item.priority === "P1" ? "warning" : "info",
    href: `/opportunities/${item.opportunityId}`,
  });

  const today = priorities
    .filter((item) => item.nextActionDueAt !== null && item.nextActionDueAt >= todayStart && item.nextActionDueAt <= todayEnd)
    .map((item) => todoFromPriority(item, "today_follow_up"));
  const overdue = priorities
    .filter((item) => item.nextActionDueAt !== null && item.nextActionDueAt < todayStart)
    .map((item) => todoFromPriority(item, "overdue_follow_up"));

  const pendingApprovals = db
    .select()
    .from(approvals)
    .where(and(inArray(approvals.requesterId, ownerIds), eq(approvals.status, "pending")))
    .orderBy(desc(approvals.createdAt))
    .all()
    .map((row) => {
      const quote = row.targetType === "quote" ? db.select().from(quotes).where(eq(quotes.id, row.targetId)).get() : undefined;
      const targetCustomer =
        row.targetType === "customer" ? db.select().from(customers).where(eq(customers.id, row.targetId)).get() : undefined;
      const customer = quote ? db.select().from(customers).where(eq(customers.id, quote.customerId)).get() : targetCustomer;
      const payload = JSON.parse(row.payloadJson) as { requestedLimitCents?: number; amountCents?: number };
      return {
        id: `approval_${row.id}`,
        kind: "approval" as const,
        title: customer
          ? `${customer.name} · ${row.type === "credit_limit" ? "提额申请" : actor.role === "manager" ? "待审批" : "审批处理中"}`
          : "待审批",
        subtitle: row.reason,
        customerId: customer?.id,
        amountCents: payload.amountCents ?? quote?.totalCents ?? payload.requestedLimitCents,
        severity: "blocker" as const,
        href: actor.role === "manager" ? "/approvals" : quote ? `/quotes/${quote.id}` : customer ? `/customers/${customer.id}` : "/dashboard",
      };
    });

  const quotesToAdvance = db
    .select()
    .from(quotes)
    .where(and(inArray(quotes.ownerId, ownerIds), eq(quotes.status, "approved"), lt(quotes.createdAt, now - 2 * DAY_MS)))
    .orderBy(desc(quotes.createdAt))
    .limit(10)
    .all()
    .map((quote) => {
      const customer = db.select().from(customers).where(eq(customers.id, quote.customerId)).get();
      return {
        id: `quote_advance_${quote.id}`,
        kind: "quote_to_advance" as const,
        title: `${customer?.name ?? "客户"} · ${quote.quoteNo}`,
        subtitle: "报价已批准但尚未转订单，建议确认客户决策进度",
        customerId: quote.customerId,
        amountCents: quote.totalCents,
        severity: "warning" as const,
        href: `/quotes/${quote.id}`,
      };
    });

  const quotesExpiring = db
    .select()
    .from(quotes)
    .where(and(inArray(quotes.ownerId, ownerIds), eq(quotes.status, "approved"), gte(quotes.validUntil, now), lte(quotes.validUntil, now + 48 * HOUR_MS)))
    .orderBy(quotes.validUntil)
    .all()
    .map((quote) => {
      const customer = db.select().from(customers).where(eq(customers.id, quote.customerId)).get();
      return {
        id: `quote_expiring_${quote.id}`,
        kind: "quote_expiring" as const,
        title: `${customer?.name ?? "客户"} · ${quote.quoteNo}`,
        subtitle: "报价将在 48 小时内到期",
        customerId: quote.customerId,
        amountCents: quote.totalCents,
        dueAt: quote.validUntil,
        severity: "warning" as const,
        href: `/quotes/${quote.id}`,
      };
    });

  const tickets = db
    .select({ ticket: afterSalesTickets, customerName: customers.name })
    .from(afterSalesTickets)
    .innerJoin(customers, eq(afterSalesTickets.customerId, customers.id))
    .where(and(inArray(customers.ownerId, ownerIds), inArray(afterSalesTickets.status, ["open", "processing"])))
    .orderBy(desc(afterSalesTickets.createdAt))
    .limit(10)
    .all()
    .map((row) => ({
      id: `ticket_${row.ticket.id}`,
      kind: "ticket" as const,
      title: `${row.customerName} · ${row.ticket.ticketNo}`,
      subtitle: row.ticket.description,
      customerId: row.ticket.customerId,
      severity: "info" as const,
      href: `/tickets/${row.ticket.id}`,
    }));

  const pendingOrders = db
    .select()
    .from(orders)
    .where(and(inArray(orders.ownerId, ownerIds), eq(orders.status, "pending_approval")))
    .orderBy(desc(orders.createdAt))
    .limit(10)
    .all()
    .map((order) => {
      const customer = db.select().from(customers).where(eq(customers.id, order.customerId)).get();
      return {
        id: `order_${order.id}`,
        kind: "order" as const,
        title: `${customer?.name ?? "客户"} · ${order.orderNo}`,
        subtitle: "订单待确认，建议尽快处理",
        customerId: order.customerId,
        amountCents: order.totalCents,
        severity: "warning" as const,
        href: `/orders/${order.id}`,
      };
    });

  return { today, overdue, approvals: pendingApprovals, quotesToAdvance, quotesExpiring, tickets, orders: pendingOrders };
}

function buildRanking(db: Db, teamUsers: Array<typeof users.$inferSelect>, now: number): SalesRankingRow[] {
  const monthStart = startOfMonthLocal(now);
  return teamUsers
    .filter((user) => user.role === "sales")
    .map((user) => {
      const sales = sum(
        db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.ownerId, user.id),
              gte(orders.createdAt, monthStart),
              inArray(orders.status, ["reserved", "fulfilled"]),
            ),
          )
          .all()
          .map((order) => order.totalCents),
      );
      const pipeline = sum(
        db
          .select()
          .from(opportunities)
          .where(and(eq(opportunities.ownerId, user.id), inArray(opportunities.stage, ACTIVE_STAGES)))
          .all()
          .map((item) => Math.round((item.amountCents * item.probability) / 100)),
      );
      const target = user.monthlyTargetCents;
      const completionRate = target > 0 ? sales / target : 0;
      const trend = completionRate >= 0.8 ? "up" : completionRate >= 0.5 ? "flat" : "down";
      return {
        ownerId: user.id,
        ownerName: user.name,
        monthSalesCents: sales,
        pipelineCents: pipeline,
        targetCents: target,
        completionRate,
        trend: trend as SalesRankingRow["trend"],
      };
    })
    .sort((a, b) => b.monthSalesCents - a.monthSalesCents);
}

export function buildWorkspace(
  db: Db,
  actor: Actor,
  options: { now?: number; scope?: "self" | "team" } = {},
): WorkspaceData {
  const now = options.now ?? Date.now();
  const scope = options.scope ?? (actor.role === "manager" ? "team" : "self");
  const ownerIds = scope === "team" && actor.role === "manager" ? teamOwnerIds(db, actor) : [actor.id];
  const rows = loadActiveRows(db, ownerIds);
  const ranked = rows
    .map((row) => scoreOpportunity(toPriorityInput(db, row, now), now))
    .sort((a, b) => b.score - a.score);

  // The war room recommends customers, not every opportunity of the same customer.
  const priorities: PriorityItem[] = [];
  const seenCustomers = new Set<string>();
  for (const item of ranked) {
    if (seenCustomers.has(item.customerId)) continue;
    seenCustomers.add(item.customerId);
    priorities.push(item);
  }

  const monthStart = startOfMonthLocal(now);
  const monthSalesCents = sum(
    db
      .select()
      .from(orders)
      .where(and(inArray(orders.ownerId, ownerIds), gte(orders.createdAt, monthStart), inArray(orders.status, ["reserved", "fulfilled"])))
      .all()
      .map((order) => order.totalCents),
  );
  const monthTargetCents = sum(
    db.select().from(users).where(inArray(users.id, ownerIds)).all().map((user) => user.monthlyTargetCents),
  );
  const todayStart = startOfDayLocal(now);
  const todayEnd = endOfDayLocal(now);
  const metrics: WorkspaceMetrics = {
    monthSalesCents,
    monthTargetCents,
    completionRate: monthTargetCents > 0 ? monthSalesCents / monthTargetCents : 0,
    expectedCloseCents: sum(ranked.map((item) => Math.round((item.amountCents * item.probability) / 100))),
    activeOpportunities: ranked.length,
    highRiskOpportunities: ranked.filter((item) => item.riskLevel === "high").length,
    pendingApprovals: db
      .select()
      .from(approvals)
      .where(and(inArray(approvals.requesterId, ownerIds), eq(approvals.status, "pending")))
      .all().length,
    todayFollowUps: ranked.filter((item) => item.nextActionDueAt !== null && item.nextActionDueAt >= todayStart && item.nextActionDueAt <= todayEnd).length,
    overdueFollowUps: ranked.filter((item) => item.nextActionDueAt !== null && item.nextActionDueAt < todayStart).length,
  };
  const recentQuotes = db
    .select({ ...getTableColumns(quotes), customerName: customers.name, ownerName: users.name })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(users, eq(quotes.ownerId, users.id))
    .where(inArray(quotes.ownerId, ownerIds))
    .orderBy(desc(quotes.createdAt))
    .limit(5)
    .all()
    .map((row) => {
      const approval = db
        .select()
        .from(approvals)
        .where(and(eq(approvals.targetType, "quote"), eq(approvals.targetId, row.id)))
        .orderBy(desc(approvals.createdAt))
        .get();
      return { ...row, approvalStatus: approval?.status ?? null, approvalType: approval?.type ?? null };
    });
  const recentOrders = db
    .select({ ...getTableColumns(orders), customerName: customers.name, ownerName: users.name })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(users, eq(orders.ownerId, users.id))
    .where(inArray(orders.ownerId, ownerIds))
    .orderBy(desc(orders.createdAt))
    .limit(5)
    .all();
  const teamUsers = db.select().from(users).where(eq(users.teamId, actor.teamId)).all();

  return {
    scope,
    actor,
    metrics,
    headline: buildHeadline(priorities),
    priorities: priorities.slice(0, 5),
    todos: buildTodos(db, actor, ownerIds, ranked, now),
    risks: ranked.filter((item) => item.riskLevel === "high" || item.priority === "P0").slice(0, 5),
    ranking: actor.role === "manager" ? buildRanking(db, teamUsers, now) : undefined,
    recentQuotes,
    recentOrders,
  };
}

export function buildCustomerAssessment(db: Db, actor: Actor, customerId: string, now = Date.now()): CustomerAssessment {
  const customer = db.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!customer) throw new AppError("NOT_FOUND", "客户不存在");
  if (!scopedOwnerIds(db, actor).includes(customer.ownerId)) throw new AppError("FORBIDDEN", "无权访问该客户");
  const items = listOpportunityViews(db, actor, { customerId }, now).filter((row) => row.priority !== null);
  const top = items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const positiveSignals: string[] = [];
  const risks: string[] = [];
  if (top) {
    if (top.probability >= 60) positiveSignals.push(`成交概率 ${top.probability}%`);
    if (["solution", "quote", "negotiation"].includes(top.stage)) {
      positiveSignals.push(`已进入${top.stage === "quote" ? "报价" : top.stage === "negotiation" ? "谈判" : "方案"}阶段`);
    }
    if (top.reasons.some((reason) => reason.includes("回复"))) positiveSignals.push("客户近期有回复");
    risks.push(...top.reasons.filter((reason) => !reason.includes("回复")));
  }
  if (customer.creditLimitCents > 0 && customer.creditUsedCents / customer.creditLimitCents >= 0.8) {
    risks.push(`信用已用 ${Math.round((customer.creditUsedCents / customer.creditLimitCents) * 100)}%`);
  }
  const summary = top
    ? `${customer.name}当前有 ${items.length} 个进行中商机，最高优先级是「${top.name}」¥${(top.amountCents / 100).toLocaleString("zh-CN")}。`
    : `${customer.name}暂无进行中商机。`;
  return {
    summary,
    positiveSignals: [...new Set(positiveSignals)].slice(0, 4),
    risks: [...new Set(risks)].slice(0, 4),
    suggestion: top?.suggestedAction ?? "先确认客户需求与决策人，再创建商机。",
    nextAction: top?.nextAction ?? null,
  };
}

export function buildOpportunityDetail(db: Db, actor: Actor, opportunityId: string, now = Date.now()) {
  const row = db
    .select({
      opportunity: opportunities,
      customerName: customers.name,
      ownerName: users.name,
      creditLimitCents: customers.creditLimitCents,
      creditUsedCents: customers.creditUsedCents,
    })
    .from(opportunities)
    .innerJoin(customers, eq(opportunities.customerId, customers.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(eq(opportunities.id, opportunityId))
    .get();
  if (!row) throw new AppError("NOT_FOUND", "商机不存在");
  if (!scopedOwnerIds(db, actor).includes(row.opportunity.ownerId)) throw new AppError("FORBIDDEN", "无权访问该商机");
  const priority = scoreOpportunity(toPriorityInput(db, row, now), now);
  const relatedQuotes = db.select().from(quotes).where(eq(quotes.opportunityId, opportunityId)).orderBy(desc(quotes.createdAt)).all();
  const relatedOrders = db.select().from(orders).where(eq(orders.opportunityId, opportunityId)).orderBy(desc(orders.createdAt)).all();
  const history = db
    .select()
    .from(followUps)
    .where(eq(followUps.opportunityId, opportunityId))
    .orderBy(desc(followUps.createdAt))
    .limit(20)
    .all();
  return {
    opportunity: row.opportunity,
    customer: db.select().from(customers).where(eq(customers.id, row.opportunity.customerId)).get()!,
    quotes: relatedQuotes,
    orders: relatedOrders,
    followUps: history,
    priority,
    assessment: buildCustomerAssessment(db, actor, row.opportunity.customerId, now),
  };
}

export function listOpportunityViews(
  db: Db,
  actor: Actor,
  filters: { stage?: OpportunityStage; risk?: RiskLevel; customerId?: string; ownerId?: string } = {},
  now = Date.now(),
): OpportunityView[] {
  const ownerIds = scopedOwnerIds(db, actor);
  const conditions: SQL[] = [inArray(opportunities.ownerId, ownerIds)];
  if (filters.stage) conditions.push(eq(opportunities.stage, filters.stage));
  if (filters.risk) conditions.push(eq(opportunities.riskLevel, filters.risk));
  if (filters.customerId) conditions.push(eq(opportunities.customerId, filters.customerId));
  if (filters.ownerId) conditions.push(eq(opportunities.ownerId, filters.ownerId));
  return db
    .select({
      opportunity: opportunities,
      customerName: customers.name,
      ownerName: users.name,
      creditLimitCents: customers.creditLimitCents,
      creditUsedCents: customers.creditUsedCents,
    })
    .from(opportunities)
    .innerJoin(customers, eq(opportunities.customerId, customers.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(opportunities.updatedAt))
    .all()
    .map((row) => {
      const base = {
        id: row.opportunity.id,
        customerId: row.opportunity.customerId,
        customerName: row.customerName,
        ownerId: row.opportunity.ownerId,
        ownerName: row.ownerName,
        name: row.opportunity.name,
        amountCents: row.opportunity.amountCents,
        stage: row.opportunity.stage,
        probability: row.opportunity.probability,
        expectedCloseDate: row.opportunity.expectedCloseDate,
        nextAction: row.opportunity.nextAction,
        nextActionDueAt: row.opportunity.nextActionDueAt,
        riskLevel: row.opportunity.riskLevel,
        lastFollowUpAt: row.opportunity.lastFollowUpAt,
        createdAt: row.opportunity.createdAt,
        updatedAt: row.opportunity.updatedAt,
      };
      if (!isActiveStage(row.opportunity.stage)) {
        return { ...base, priority: null, score: null, reasons: [], suggestedAction: null };
      }
      const scored = scoreOpportunity(toPriorityInput(db, row, now), now);
      return {
        ...base,
        riskLevel: scored.riskLevel,
        priority: scored.priority,
        score: scored.score,
        reasons: scored.reasons,
        suggestedAction: scored.suggestedAction,
      };
    });
}
