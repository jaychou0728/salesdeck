import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { FollowUpType, OpportunityStage, RiskLevel } from "@salespilot/shared";

// drizzle-kit loads this file through a CJS loader that cannot require the ESM-only
// @salespilot/shared package, so the values are repeated here. The type annotations
// below make TypeScript reject any value that is not part of the shared unions; keep
// them in sync with OPPORTUNITY_STAGES / RISK_LEVELS / FOLLOW_UP_TYPES in shared.
const OPPORTUNITY_STAGE_VALUES: [OpportunityStage, ...OpportunityStage[]] = [
  "lead",
  "needs",
  "solution",
  "quote",
  "negotiation",
  "won",
  "lost",
];
const RISK_LEVEL_VALUES: [RiskLevel, ...RiskLevel[]] = ["low", "medium", "high"];
const FOLLOW_UP_TYPE_VALUES: [FollowUpType, ...FollowUpType[]] = [
  "call",
  "wechat",
  "email",
  "meeting",
  "quote",
  "system",
  "ai_suggestion",
];

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["sales", "manager"] }).notNull(),
  teamId: text("team_id").notNull(),
  monthlyTargetCents: integer("monthly_target_cents").notNull().default(0),
});

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  level: text("level", { enum: ["A", "B", "C"] }).notNull(),
  ownerId: text("owner_id").notNull(),
  region: text("region").notNull(),
  creditLimitCents: integer("credit_limit_cents").notNull(),
  creditUsedCents: integer("credit_used_cents").notNull().default(0),
  paymentTerms: text("payment_terms").notNull(),
  status: text("status").notNull().default("active"),
});

export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
});

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit: text("unit").notNull().default("台"),
    listPriceCents: integer("list_price_cents").notNull(),
    costCents: integer("cost_cents").notNull(),
    floorPriceCents: integer("floor_price_cents").notNull(),
    taxRateBps: integer("tax_rate_bps").notNull().default(1300),
    status: text("status").notNull().default("active"),
  },
  (t) => ({ skuIdx: uniqueIndex("products_sku_idx").on(t.sku) }),
);

export const priceRules = sqliteTable("price_rules", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  customerLevel: text("customer_level", { enum: ["A", "B", "C"] }).notNull(),
  minQty: integer("min_qty").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  discountBps: integer("discount_bps").notNull().default(0),
  priority: integer("priority").notNull().default(0),
  effectiveFrom: integer("effective_from").notNull(),
  effectiveTo: integer("effective_to"),
});

export const warehouses = sqliteTable("warehouses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull(),
});

export const inventory = sqliteTable(
  "inventory",
  {
    warehouseId: text("warehouse_id").notNull(),
    productId: text("product_id").notNull(),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    safetyStock: integer("safety_stock").notNull().default(0),
    etaDays: integer("eta_days").notNull().default(1),
    version: integer("version").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.warehouseId, t.productId] }),
    productIdx: index("inventory_product_idx").on(t.productId),
  }),
);

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    quoteNo: text("quote_no").notNull(),
    customerId: text("customer_id").notNull(),
    contactId: text("contact_id").notNull(),
    ownerId: text("owner_id").notNull(),
    status: text("status").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountTotalCents: integer("discount_total_cents").notNull().default(0),
    taxTotalCents: integer("tax_total_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    validUntil: integer("valid_until").notNull(),
    riskFlags: text("risk_flags").notNull().default("[]"),
    notes: text("notes"),
    opportunityId: text("opportunity_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ noIdx: uniqueIndex("quotes_no_idx").on(t.quoteNo) }),
);

export const quoteLines = sqliteTable("quote_lines", {
  id: text("id").primaryKey(),
  quoteId: text("quote_id").notNull(),
  productId: text("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  discountRateBps: integer("discount_rate_bps").notNull().default(0),
  lineTotalCents: integer("line_total_cents").notNull(),
  convertedQuantity: integer("converted_quantity").notNull().default(0),
  warehouseId: text("warehouse_id"),
});

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNo: text("order_no").notNull(),
    quoteId: text("quote_id").notNull(),
    customerId: text("customer_id").notNull(),
    ownerId: text("owner_id").notNull(),
    status: text("status").notNull(),
    totalCents: integer("total_cents").notNull(),
    paymentTerms: text("payment_terms").notNull(),
    opportunityId: text("opportunity_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ noIdx: uniqueIndex("orders_no_idx").on(t.orderNo) }),
);

export const orderLines = sqliteTable("order_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  quoteLineId: text("quote_line_id"),
  productId: text("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  warehouseId: text("warehouse_id").notNull(),
});

export const stockReservations = sqliteTable("stock_reservations", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  productId: text("product_id").notNull(),
  warehouseId: text("warehouse_id").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull(),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  requesterId: text("requester_id").notNull(),
  approverId: text("approver_id"),
  status: text("status").notNull(),
  reason: text("reason").notNull(),
  comment: text("comment"),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
  decidedAt: integer("decided_at"),
});

export const afterSalesTickets = sqliteTable(
  "after_sales_tickets",
  {
    id: text("id").primaryKey(),
    ticketNo: text("ticket_no").notNull(),
    customerId: text("customer_id").notNull(),
    orderId: text("order_id"),
    productId: text("product_id").notNull(),
    serialNo: text("serial_no"),
    issueType: text("issue_type").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    policyRefs: text("policy_refs").notNull().default("[]"),
    resolution: text("resolution"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ noIdx: uniqueIndex("tickets_no_idx").on(t.ticketNo) }),
);

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  title: text("title").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content"),
  toolCallsJson: text("tool_calls_json"),
  createdAt: integer("created_at").notNull(),
});

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id"),
  actorId: text("actor_id").notNull(),
  status: text("status").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
});

export const traceEvents = sqliteTable(
  "trace_events",
  {
    id: text("id").primaryKey(),
    traceId: text("trace_id").notNull(),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    name: text("name"),
    payloadJson: text("payload_json").notNull().default("{}"),
    status: text("status"),
    latencyMs: integer("latency_ms"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ traceIdx: index("trace_events_trace_idx").on(t.traceId, t.seq) }),
);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  traceId: text("trace_id"),
  actorId: text("actor_id").notNull(),
  toolName: text("tool_name").notNull(),
  argsJson: text("args_json").notNull(),
  resultJson: text("result_json").notNull(),
  status: text("status").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  actorId: text("actor_id").notNull(),
  toolName: text("tool_name").notNull(),
  requestHash: text("request_hash").notNull(),
  responseJson: text("response_json").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const confirmationTokens = sqliteTable("confirmation_tokens", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  toolName: text("tool_name").notNull(),
  payloadHash: text("payload_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export const knowledgeDocs = sqliteTable("knowledge_docs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  effectiveDate: text("effective_date"),
  contentHash: text("content_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const knowledgeChunks = sqliteTable(
  "knowledge_chunks",
  {
    id: text("id").primaryKey(),
    docId: text("doc_id").notNull(),
    heading: text("heading").notNull(),
    content: text("content").notNull(),
    embeddingJson: text("embedding_json").notNull(),
    tokenCount: integer("token_count").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ docIdx: index("knowledge_chunks_doc_idx").on(t.docId) }),
);

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    stage: text("stage", { enum: OPPORTUNITY_STAGE_VALUES }).notNull(),
    probability: integer("probability").notNull().default(0),
    expectedCloseDate: integer("expected_close_date").notNull(),
    nextAction: text("next_action"),
    nextActionDueAt: integer("next_action_due_at"),
    riskLevel: text("risk_level", { enum: RISK_LEVEL_VALUES }).notNull().default("low"),
    lastFollowUpAt: integer("last_follow_up_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    customerIdx: index("opportunities_customer_idx").on(t.customerId),
    ownerStageIdx: index("opportunities_owner_stage_idx").on(t.ownerId, t.stage),
    dueIdx: index("opportunities_due_idx").on(t.nextActionDueAt),
  }),
);

export const followUps = sqliteTable(
  "follow_ups",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    opportunityId: text("opportunity_id"),
    actorId: text("actor_id").notNull(),
    type: text("type", { enum: FOLLOW_UP_TYPE_VALUES }).notNull(),
    content: text("content").notNull(),
    result: text("result"),
    nextAction: text("next_action"),
    nextActionDueAt: integer("next_action_due_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    customerIdx: index("follow_ups_customer_idx").on(t.customerId, t.createdAt),
    opportunityIdx: index("follow_ups_opportunity_idx").on(t.opportunityId, t.createdAt),
  }),
);
