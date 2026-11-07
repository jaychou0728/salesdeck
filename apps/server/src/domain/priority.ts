import type { OpportunityStage, PriorityItem, PriorityLevel, RiskLevel } from "@salespilot/shared";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const AMOUNT_CAP_CENTS = 30_000_000;
const ACTIVE_STAGES: OpportunityStage[] = ["lead", "needs", "solution", "quote", "negotiation"];

export interface PrioritySignalsInput {
  creditUtilization: number | null;
  quoteExpiringAt: number | null;
  stockShortage: boolean;
  recentCustomerReply: boolean;
}

export interface PriorityInput {
  opportunityId: string;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  amountCents: number;
  stage: OpportunityStage;
  probability: number;
  riskLevel: RiskLevel;
  nextAction: string | null;
  nextActionDueAt: number | null;
  lastFollowUpAt: number | null;
  createdAt: number;
  signals: PrioritySignalsInput;
}

const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function isActiveStage(stage: OpportunityStage) {
  return ACTIVE_STAGES.includes(stage);
}

export function deriveRiskLevel(
  stored: RiskLevel,
  signals: Omit<PrioritySignalsInput, "recentCustomerReply">,
): RiskLevel {
  let derived: RiskLevel = "low";
  if (signals.creditUtilization !== null && signals.creditUtilization >= 0.9) derived = "high";
  else if (signals.creditUtilization !== null && signals.creditUtilization >= 0.8) derived = "medium";
  if (signals.stockShortage) derived = "high";
  if (signals.quoteExpiringAt !== null && RISK_RANK[derived] < RISK_RANK.medium) derived = "medium";
  return RISK_RANK[derived] > RISK_RANK[stored] ? derived : stored;
}

function buildReasons(
  input: PriorityInput,
  now: number,
  idleDays: number,
  overdueDays: number,
  riskLevel: RiskLevel,
) {
  const reasons: string[] = [];
  const todayStart = startOfDay(now);
  if (overdueDays > 0) reasons.push(`下一步已逾期 ${Math.max(1, Math.ceil(overdueDays))} 天`);
  else if (input.nextActionDueAt !== null && input.nextActionDueAt >= todayStart && input.nextActionDueAt < todayStart + DAY_MS) {
    reasons.push("下一步今天到期");
  }
  if (idleDays >= 3) reasons.push(`已 ${Math.floor(idleDays)} 天未跟进`);
  if (input.signals.creditUtilization !== null && input.signals.creditUtilization >= 0.8) {
    reasons.push(`信用已用 ${Math.round(input.signals.creditUtilization * 100)}%`);
  }
  if (input.signals.quoteExpiringAt !== null) {
    reasons.push(`报价将在 ${Math.max(1, Math.ceil((input.signals.quoteExpiringAt - now) / HOUR_MS))} 小时内到期`);
  }
  if (input.signals.stockShortage) reasons.push("关联 SKU 可用库存低于需求");
  if (input.signals.recentCustomerReply) reasons.push("客户今天有回复");
  if (riskLevel === "high") reasons.push("综合风险等级为高");
  if (reasons.length === 0) reasons.push("商机处于活跃阶段");
  return reasons.slice(0, 4);
}

function buildSuggestedAction(input: PriorityInput, now: number, overdueDays: number) {
  const actions: string[] = [];
  if (input.signals.stockShortage && (input.stage === "quote" || input.stage === "negotiation")) {
    actions.push("先确认客户预算与交付时间，再决定是否申请备货或调拨");
  }
  if (input.signals.creditUtilization !== null && input.signals.creditUtilization >= 0.8) {
    actions.push("确认回款或申请信用审批后再推进");
  }
  if (input.signals.quoteExpiringAt !== null) {
    actions.push("今天联系客户确认报价，必要时重新出价");
  }
  if (input.signals.recentCustomerReply) {
    actions.push("按客户最新回复发送下一版方案或报价");
  }
  const idleDays = (now - (input.lastFollowUpAt ?? input.createdAt)) / DAY_MS;
  if (overdueDays > 0 || idleDays >= 3) actions.push("今天电话联系客户确认下一步");
  if (actions.length === 0) {
    const byStage: Record<OpportunityStage, string> = {
      lead: "完成需求访谈并确认预算",
      needs: "确认需求清单与决策人",
      solution: "安排方案沟通并确认时间表",
      quote: "确认客户对报价的反馈",
      negotiation: "推动合同与交付条款确认",
      won: "确认交付与回款计划",
      lost: "复盘丢单原因",
    };
    actions.push(byStage[input.stage]);
  }
  return actions.slice(0, 2).join("；");
}

export function scoreOpportunity(input: PriorityInput, now = Date.now()): PriorityItem {
  const idleDays = Math.max(0, (now - (input.lastFollowUpAt ?? input.createdAt)) / DAY_MS);
  const overdueDays =
    input.nextActionDueAt !== null && input.nextActionDueAt < now
      ? Math.max(0.5, (now - input.nextActionDueAt) / DAY_MS)
      : 0;
  const todayStart = startOfDay(now);
  const dueSoon =
    input.nextActionDueAt !== null &&
    input.nextActionDueAt >= now &&
    input.nextActionDueAt >= todayStart &&
    input.nextActionDueAt < todayStart + DAY_MS
      ? 0.3
      : 0;
  const urgency = clamp(Math.max(idleDays / 7, overdueDays / 2, dueSoon), 0, 1);
  const riskLevel = deriveRiskLevel(input.riskLevel, input.signals);
  const riskFactor = riskLevel === "high" ? 1 : riskLevel === "medium" ? 0.7 : 0.4;
  const amountNorm = clamp(input.amountCents / AMOUNT_CAP_CENTS, 0, 1);
  const probabilityNorm = clamp(input.probability / 100, 0, 1);
  const score = Math.round(100 * (0.4 * amountNorm + 0.25 * probabilityNorm + 0.2 * urgency + 0.15 * riskFactor));
  const priority: PriorityLevel = score >= 60 ? "P0" : score >= 40 ? "P1" : "P2";

  return {
    opportunityId: input.opportunityId,
    customerId: input.customerId,
    customerName: input.customerName,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    name: input.name,
    amountCents: input.amountCents,
    stage: input.stage,
    probability: input.probability,
    riskLevel,
    priority,
    score,
    reasons: buildReasons(input, now, idleDays, overdueDays, riskLevel),
    suggestedAction: buildSuggestedAction(input, now, overdueDays),
    nextAction: input.nextAction,
    nextActionDueAt: input.nextActionDueAt,
    lastFollowUpAt: input.lastFollowUpAt,
    signals: {
      creditUtilization: input.signals.creditUtilization,
      quoteExpiringAt: input.signals.quoteExpiringAt,
      stockShortage: input.signals.stockShortage,
      recentCustomerReply: input.signals.recentCustomerReply,
      idleDays,
      overdueDays,
    },
  };
}
