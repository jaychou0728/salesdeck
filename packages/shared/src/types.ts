export type Role = "sales" | "manager";
export type CustomerLevel = "A" | "B" | "C";
export type QuoteStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "converted"
  | "expired"
  | "cancelled";
export type OrderStatus = "pending_approval" | "reserved" | "fulfilled" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type TicketStatus = "open" | "processing" | "resolved" | "closed";

export interface Actor {
  id: string;
  name: string;
  role: Role;
  teamId: string;
}

export interface Customer {
  id: string;
  name: string;
  industry: string;
  level: CustomerLevel;
  ownerId: string;
  region: string;
  creditLimitCents: number;
  creditUsedCents: number;
  paymentTerms: string;
  status: string;
}

export interface Contact {
  id: string;
  customerId: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface PricingLine {
  sku: string;
  quantity: number;
  listPriceCents: number;
  tierPriceCents: number;
  finalPriceCents: number;
  floorPriceCents: number;
  belowFloor: boolean;
  lineTotalCents: number;
  ruleRefs: string[];
}

export type ArtifactKind =
  | "customer"
  | "inventory"
  | "quote"
  | "approval"
  | "ticket"
  | "briefing"
  | "follow_up"
  | "next_action"
  | "error";

export interface Artifact {
  kind: ArtifactKind;
  toolName?: string;
  title: string;
  payload: unknown;
  confirmationToken?: string;
}

export type TraceEventType =
  | "trace.start"
  | "step.start"
  | "step.end"
  | "token"
  | "artifact"
  | "trace.end"
  | "error";

export interface TraceEvent {
  type: TraceEventType;
  name?: string;
  status?: "ok" | "error";
  payload?: unknown;
  latencyMs?: number;
  seq?: number;
  traceId?: string;
}

export type OpportunityStage = "lead" | "needs" | "solution" | "quote" | "negotiation" | "won" | "lost";
export type RiskLevel = "low" | "medium" | "high";
export type FollowUpType = "call" | "wechat" | "email" | "meeting" | "quote" | "system" | "ai_suggestion";
export type PriorityLevel = "P0" | "P1" | "P2";

export interface OpportunitySignals {
  creditUtilization: number | null;
  quoteExpiringAt: number | null;
  stockShortage: boolean;
  recentCustomerReply: boolean;
  idleDays: number;
  overdueDays: number;
}

export interface PriorityItem {
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
  priority: PriorityLevel;
  score: number;
  reasons: string[];
  suggestedAction: string;
  nextAction: string | null;
  nextActionDueAt: number | null;
  lastFollowUpAt: number | null;
  signals: OpportunitySignals;
}

export type TodoKind =
  | "today_follow_up"
  | "overdue_follow_up"
  | "approval"
  | "quote_to_advance"
  | "quote_expiring"
  | "ticket"
  | "order";

export interface TodoItem {
  id: string;
  kind: TodoKind;
  title: string;
  subtitle: string;
  customerId?: string;
  opportunityId?: string;
  amountCents?: number;
  dueAt?: number;
  severity: "info" | "warning" | "blocker";
  href: string;
}
