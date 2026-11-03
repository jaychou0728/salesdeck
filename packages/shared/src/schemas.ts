import { z } from "zod";

export const moneyCents = z.number().int().nonnegative();
export const quantity = z.number().int().positive().max(100_000);
export const customerLevel = z.enum(["A", "B", "C"]);
export const role = z.enum(["sales", "manager"]);

export const SearchCustomersInput = z.object({
  query: z.string().min(1).max(100),
  level: customerLevel.optional(),
  limit: z.number().int().min(1).max(20).default(10),
});
export type SearchCustomersInput = z.infer<typeof SearchCustomersInput>;

export const GetCustomer360Input = z.object({ customerId: z.string().min(1) });
export type GetCustomer360Input = z.infer<typeof GetCustomer360Input>;

export const CheckInventoryInput = z.object({
  skuQuery: z.string().min(1).max(100),
  quantity: quantity.optional(),
  needByDate: z.string().optional(),
  region: z.string().optional(),
});
export type CheckInventoryInput = z.infer<typeof CheckInventoryInput>;

export const GetPricingInput = z.object({
  customerId: z.string().min(1),
  items: z.array(z.object({ sku: z.string().min(1), quantity })).min(1).max(50),
});
export type GetPricingInput = z.infer<typeof GetPricingInput>;

export const SearchKnowledgeInput = z.object({
  query: z.string().min(1).max(500),
  docTypes: z.array(z.string()).optional(),
  topK: z.number().int().min(1).max(10).default(5),
});
export type SearchKnowledgeInput = z.infer<typeof SearchKnowledgeInput>;

const quoteLineInput = z.object({
  sku: z.string().min(1),
  quantity,
  warehouseId: z.string().optional(),
});

export const CreateQuoteInput = z
  .object({
    customerId: z.string().min(1),
    contactId: z.string().min(1),
    lines: z.array(quoteLineInput).min(1).max(50),
    validDays: z.number().int().min(1).max(30).default(7),
    notes: z.string().max(500).optional(),
    dryRun: z.boolean(),
    confirmationToken: z.string().min(10).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .refine((v) => v.dryRun || (!!v.confirmationToken && !!v.idempotencyKey), {
    message: "commit requires confirmationToken and idempotencyKey",
  });
export type CreateQuoteInput = z.infer<typeof CreateQuoteInput>;

export const ConvertQuoteToOrderInput = z
  .object({
    quoteId: z.string().min(1),
    paymentTerms: z.string().max(50).optional(),
    dryRun: z.boolean(),
    confirmationToken: z.string().min(10).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .refine((v) => v.dryRun || (!!v.confirmationToken && !!v.idempotencyKey), {
    message: "commit requires confirmationToken and idempotencyKey",
  });
export type ConvertQuoteToOrderInput = z.infer<typeof ConvertQuoteToOrderInput>;

export const CreateAfterSalesTicketInput = z
  .object({
    customerId: z.string().min(1),
    orderId: z.string().optional(),
    productId: z.string().min(1),
    serialNo: z.string().max(100).optional(),
    issueType: z.enum(["DOA", "repair", "return"]),
    description: z.string().min(5).max(1000),
    policyRefs: z.array(z.string()).min(1).max(10),
    dryRun: z.boolean(),
    confirmationToken: z.string().min(10).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .refine((v) => v.dryRun || (!!v.confirmationToken && !!v.idempotencyKey), {
    message: "commit requires confirmationToken and idempotencyKey",
  });
export type CreateAfterSalesTicketInput = z.infer<typeof CreateAfterSalesTicketInput>;

export const GetSalesBriefingInput = z.object({
  scope: z.enum(["self", "team"]),
  date: z.string().optional(),
});
export type GetSalesBriefingInput = z.infer<typeof GetSalesBriefingInput>;

export const ChatRequest = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(2000),
  actorId: z.string().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ConfirmRequest = z.object({
  token: z.string().min(10),
  toolName: z.enum(["create_quote", "convert_quote_to_order", "create_after_sales_ticket"]),
  payload: z.record(z.unknown()),
  idempotencyKey: z.string().min(8).max(100),
});
export type ConfirmRequest = z.infer<typeof ConfirmRequest>;

export const ApprovalDecision = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(100),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
