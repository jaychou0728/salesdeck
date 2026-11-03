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
