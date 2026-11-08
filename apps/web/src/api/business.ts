import { useCallback, useEffect, useState } from "react";
import type {
  Artifact,
  CustomerLevel,
  FollowUpType,
  OpportunitySignals,
  OpportunityStage,
  PriorityItem,
  RiskLevel,
  Role,
  TodoItem,
  TraceEvent,
} from "@salespilot/shared";
import { useAppStore } from "../state/store";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  suggestedAction?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
    public readonly suggestedAction?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequest<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const actorId = useAppStore.getState().actorId;
  const headers: Record<string, string> = { "x-actor-id": actorId };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "无法连接服务器，请检查服务是否启动", 0);
  }
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: ApiErrorBody }
    | null;
  if (!response.ok || !payload || payload.ok === false) {
    const error = payload?.error;
    throw new ApiError(
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? `请求失败（${response.status}）`,
      response.status,
      error?.details,
      error?.suggestedAction,
    );
  }
  return payload as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>("GET", path);
}

export function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  return apiRequest<T>("POST", path, body);
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>("PATCH", path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>("DELETE", path);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}

/** Fetch a GET endpoint, refetching when the actor or the data version changes. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const actorId = useAppStore((state) => state.actorId);
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<T>(path)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, actorId, dataVersion, tick, ...deps]);

  return { data, loading, error, refetch };
}

/* ------------------------------------------------------------------ */
/* Types (mirror apps/server/src/routes/business.ts response shapes)   */
/* ------------------------------------------------------------------ */

export interface ActorProfile {
  id: string;
  name: string;
  role: Role;
  teamId: string;
}

export interface MeResponse {
  actor: ActorProfile;
  permissions: { scope: "self" | "team"; canApprove: boolean; canAdjustInventory: boolean };
}

export interface TeamMemberRow {
  id: string;
  name: string;
  role: Role;
  teamId: string;
}

export interface TeamMembersResponse {
  ok: true;
  members: TeamMemberRow[];
}

export interface CustomerRow {
  id: string;
  name: string;
  industry: string;
  level: CustomerLevel;
  ownerId: string;
  ownerName: string | null;
  region: string;
  creditLimitCents: number;
  creditUsedCents: number;
  paymentTerms: string;
  status: string;
  creditUtilization: number;
}

export interface ContactRow {
  id: string;
  customerId: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface CreditInfo {
  limitCents: number;
  usedCents: number;
  availableCents: number;
  utilization: number;
}

export interface QuoteRow {
  id: string;
  quoteNo: string;
  opportunityId: string | null;
  customerId: string;
  contactId: string;
  ownerId: string;
  status: string;
  subtotalCents: number;
  discountTotalCents: number;
  taxTotalCents: number;
  totalCents: number;
  validUntil: number;
  riskFlags: string;
  notes: string | null;
  createdAt: number;
  customerName: string | null;
  ownerName: string | null;
  approvalStatus?: string | null;
  approvalType?: string | null;
}

export interface OrderRow {
  id: string;
  orderNo: string;
  quoteId: string;
  opportunityId: string | null;
  customerId: string;
  ownerId: string;
  status: string;
  totalCents: number;
  paymentTerms: string;
  createdAt: number;
  customerName: string | null;
  ownerName: string | null;
}

export interface TicketRow {
  id: string;
  ticketNo: string;
  customerId: string;
  orderId: string | null;
  productId: string;
  serialNo: string | null;
  issueType: string;
  description: string;
  status: string;
  policyRefs: string;
  resolution: string | null;
  createdAt: number;
  customerName: string | null;
  productName: string | null;
}

export interface QuoteLineRow {
  id: string;
  quoteId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  discountRateBps: number;
  lineTotalCents: number;
  convertedQuantity: number;
  warehouseId: string | null;
  productName: string | null;
  sku: string | null;
}

export interface ConvertPreviewLine extends QuoteLineRow {
  remainingQuantity: number;
  convertingQuantity: number;
  remainingAfter: number;
}

export interface OrderLineRow {
  id: string;
  orderId: string;
  quoteLineId?: string | null;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  warehouseId: string;
  productName: string | null;
  sku: string | null;
}

export interface ReservationRow {
  id: string;
  orderId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: string;
  warehouseName: string | null;
}

export interface ApprovalRow {
  id: string;
  type: string;
  targetType: string;
  targetId: string;
  status: string;
  reason: string;
  comment: string | null;
  requesterId: string;
  requesterName: string | null;
  approverId: string | null;
  approverName: string | null;
  amountCents: number;
  customerId: string | null;
  customerName: string | null;
  createdAt: number;
  decidedAt: number | null;
  payload: unknown;
}

export interface InventoryRow {
  warehouseId: string;
  productId: string;
  onHand: number;
  reserved: number;
  safetyStock: number;
  etaDays: number;
  version: number;
  productName: string;
  sku: string;
  category: string;
  unit: string;
  listPriceCents: number;
  warehouseName: string;
  region: string;
  available: number;
  lowStock: boolean;
}

export interface AlertRow {
  type: string;
  severity: "info" | "warning" | "blocker";
  entityRef?: { kind: string; id: string; name: string; warehouseId?: string };
  why: string;
  suggestedAction: string;
}

export interface DashboardResponse {
  metrics: {
    customers: number;
    openQuotes: number;
    pendingApprovals: number;
    lowStock: number;
    openTickets: number;
  };
  alerts: AlertRow[];
  recentQuotes: QuoteRow[];
  recentOrders: OrderRow[];
}

export interface CustomersResponse {
  customers: CustomerRow[];
}

export interface OpportunityRow {
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
  priority: "P0" | "P1" | "P2" | null;
  score: number | null;
  reasons: string[];
  suggestedAction: string | null;
}

export interface FollowUpRow {
  id: string;
  customerId: string;
  opportunityId: string | null;
  actorId: string;
  type: FollowUpType;
  content: string;
  result: string | null;
  nextAction: string | null;
  nextActionDueAt: number | null;
  createdAt: number;
}

export interface CustomerAssessment {
  summary: string;
  positiveSignals: string[];
  risks: string[];
  suggestion: string;
  nextAction: string | null;
}

export interface CustomerDetailResponse {
  customer: CustomerRow;
  contacts: ContactRow[];
  credit: CreditInfo;
  quotes: QuoteRow[];
  orders: OrderRow[];
  tickets: TicketRow[];
  opportunities: OpportunityRow[];
  followUps: FollowUpRow[];
  assessment: CustomerAssessment;
}

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

export interface WorkspaceResponse {
  ok: true;
  scope: "self" | "team";
  actor: ActorProfile;
  metrics: WorkspaceMetrics;
  headline: string;
  priorities: PriorityItem[];
  todos: {
    today: TodoItem[];
    overdue: TodoItem[];
    approvals: TodoItem[];
    quotesToAdvance: TodoItem[];
    quotesExpiring: TodoItem[];
    tickets: TodoItem[];
    orders: TodoItem[];
  };
  risks: PriorityItem[];
  ranking?: SalesRankingRow[];
  recentQuotes: QuoteRow[];
  recentOrders: OrderRow[];
  alerts: AlertRow[];
}

export interface OpportunitiesResponse {
  ok: true;
  opportunities: OpportunityRow[];
}

export interface OpportunityDetailResponse {
  ok: true;
  opportunity: {
    id: string;
    customerId: string;
    ownerId: string;
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
  };
  customer: CustomerRow;
  quotes: QuoteRow[];
  orders: OrderRow[];
  followUps: FollowUpRow[];
  priority: PriorityItem;
  assessment: CustomerAssessment;
}

export interface InventoryResponse {
  inventory: InventoryRow[];
}

export interface InventoryAdjustResult {
  row: InventoryRow;
}

export interface InventoryTransferResult {
  from: { warehouseId: string; warehouseName: string; productId: string; sku: string; productName: string; onHand: number; reserved: number; available: number };
  to: { warehouseId: string; warehouseName: string; productId: string; sku: string; productName: string; onHand: number; reserved: number; available: number };
}

export interface QuotesResponse {
  quotes: QuoteRow[];
}

export interface QuoteDetailResponse {
  quote: QuoteRow;
  customer: CustomerRow | null;
  contact: ContactRow | null;
  lines: QuoteLineRow[];
  approval: ApprovalRow | null;
}

export interface RiskFlagView {
  code: string;
  message: string;
  severity: "info" | "warning" | "blocker";
}

export interface QuotePreviewLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  floorPriceCents: number;
  belowFloor: boolean;
  lineTotalCents: number;
  taxRateBps: number;
  ruleRefs: string[];
}

export interface QuotePreview {
  customer: { id: string; name: string; level: CustomerLevel; creditAvailableCents: number };
  contact: ContactRow;
  lines: QuotePreviewLine[];
  totals: { subtotalCents: number; discountTotalCents: number; taxTotalCents: number; totalCents: number };
  validUntil: number;
  riskFlags: RiskFlagView[];
}

export interface QuotePreviewResponse {
  preview: QuotePreview;
  input: Record<string, unknown>;
  confirmationToken: string;
}

export interface QuoteCommitResponse {
  data: {
    status: "committed" | "pending_confirmation";
    quote: { id: string; status: string } & Partial<QuotePreview>;
    approvalId?: string;
    replayed?: boolean;
  };
  meta?: unknown;
  warnings?: string[];
  risk?: RiskFlagView[];
}

export interface ConvertPreview {
  quoteId: string;
  quoteNo: string;
  /** Amount of this conversion (selected quantities only). */
  totalCents: number;
  quoteTotalCents: number;
  creditAvailableCents: number;
  requiresApproval: boolean;
  reason: string | null;
  lines: ConvertPreviewLine[];
  stockChecks: Array<{
    quoteLineId: string;
    productId: string;
    quantity: number;
    canFulfill: boolean;
    missing: number;
    allocations: Array<{ warehouseId: string; warehouseName?: string; quantity: number }>;
  }>;
  canFulfill: boolean;
  partiallyConverted: boolean;
  fullyConvertedAfter: boolean;
}

export interface ConvertPreviewResponse {
  preview: ConvertPreview;
  input: Record<string, unknown>;
  confirmationToken: string;
}

export interface ConvertCommitResponse {
  data: {
    status: "committed" | "pending_approval";
    approvalId?: string;
    order?: OrderRow & { fullyConverted?: boolean; remainingQuantity?: number };
    preview?: ConvertPreview;
    replayed?: boolean;
  };
}

export interface OrdersResponse {
  orders: OrderRow[];
}

export interface OrderDetailResponse {
  order: OrderRow;
  customer: CustomerRow | null;
  lines: OrderLineRow[];
  reservations: ReservationRow[];
}

export interface TicketsResponse {
  tickets: TicketRow[];
}

export interface TicketDetailResponse {
  ticket: TicketRow;
  customer: CustomerRow | null;
  order: OrderRow | null;
  product: { id: string; sku: string; name: string } | null;
}

export interface ApprovalsResponse {
  approvals: ApprovalRow[];
}

export interface ApprovalDetailResponse {
  approval: ApprovalRow;
}

export interface ApprovalDecisionResponse {
  data: { status: "approved" | "rejected"; order?: OrderRow; creditLimitCents?: number; replayed?: boolean };
}

export interface TraceRow {
  id: string;
  conversationId: string | null;
  actorId: string;
  status: string;
  startedAt: number;
  endedAt: number | null;
  inputTokens: number;
  outputTokens: number;
}

export interface TraceEventRow {
  id: string;
  traceId: string;
  seq: number;
  type: string;
  name: string | null;
  payload: unknown;
  status: string | null;
  latencyMs: number | null;
  createdAt: number;
}

export interface TracesResponse {
  traces: TraceRow[];
}

export interface TraceDetailResponse {
  trace: TraceRow;
  events: TraceEventRow[];
}

export interface AuditRow {
  id: string;
  traceId: string | null;
  actorId: string;
  actorName: string | null;
  toolName: string;
  args: unknown;
  result: unknown;
  status: string;
  latencyMs: number;
  createdAt: number;
}

export interface AuditResponse {
  audit: AuditRow[];
}

/** Shape accepted by TraceTimeline: live SSE events or DB trace events. */
export type TraceEventLike = TraceEvent | TraceEventRow;

export type { Artifact, FollowUpType, OpportunitySignals, OpportunityStage, PriorityItem, RiskLevel, TodoItem };
