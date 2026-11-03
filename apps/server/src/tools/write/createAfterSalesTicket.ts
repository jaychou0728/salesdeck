import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { CreateAfterSalesTicketInput, fail, ok } from "@salespilot/shared";
import { afterSalesTickets, customers, knowledgeChunks, orders, products } from "../../db/schema.js";
import { consumeConfirmationToken, issueConfirmationToken } from "../../domain/confirmation.js";
import { withIdempotency } from "../../domain/idempotency.js";
import { assertCustomerAccess } from "../../domain/permissions.js";
import type { ToolDefinition } from "../types.js";

const businessPayload = (input: CreateAfterSalesTicketInput) => ({
  customerId: input.customerId,
  orderId: input.orderId,
  productId: input.productId,
  serialNo: input.serialNo,
  issueType: input.issueType,
  description: input.description,
  policyRefs: input.policyRefs,
});

export const createAfterSalesTicket: ToolDefinition<CreateAfterSalesTicketInput, unknown> = {
  name: "create_after_sales_ticket",
  description: "创建售后工单。政策引用必须来自知识库检索结果；先预览确认再提交。",
  inputSchema: CreateAfterSalesTicketInput,
  kind: "write",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const customer = ctx.db.select().from(customers).where(eq(customers.id, input.customerId)).get();
    if (!customer) return { model: fail("NOT_FOUND", "客户不存在") };
    assertCustomerAccess(ctx.actor, customer);
    const product = ctx.db.select().from(products).where(eq(products.id, input.productId)).get();
    if (!product) return { model: fail("NOT_FOUND", "产品不存在") };
    if (input.orderId) {
      const order = ctx.db.select().from(orders).where(eq(orders.id, input.orderId)).get();
      if (!order || order.customerId !== customer.id) {
        return { model: fail("VALIDATION_ERROR", "订单不存在或不属于该客户") };
      }
    }
    const validRefs = input.policyRefs.filter((ref) => ctx.db.select().from(knowledgeChunks).where(eq(knowledgeChunks.id, ref)).get());
    if (validRefs.length !== input.policyRefs.length) return { model: fail("VALIDATION_ERROR", "政策引用必须来自知识库检索结果") };
    const preview = { customer: { id: customer.id, name: customer.name }, product: { id: product.id, sku: product.sku, name: product.name }, issueType: input.issueType, description: input.description, policyRefs: validRefs };
    if (input.dryRun) {
      const { token, expiresAt } = issueConfirmationToken(ctx.db, { actorId: ctx.actor.id, toolName: "create_after_sales_ticket", payload: businessPayload(input) });
      return { model: ok({ status: "pending_confirmation", preview, expiresAt }), artifacts: [{ kind: "ticket", toolName: "create_after_sales_ticket", title: "售后工单预览", payload: { preview, input: businessPayload(input) }, confirmationToken: token }] };
    }
    const result = withIdempotency(ctx.db, { key: input.idempotencyKey!, actorId: ctx.actor.id, toolName: "create_after_sales_ticket", request: businessPayload(input) }, () => {
      consumeConfirmationToken(ctx.db, input.confirmationToken!, { actorId: ctx.actor.id, toolName: "create_after_sales_ticket", payload: businessPayload(input) });
      const ticketId = `tk_${randomUUID()}`;
      ctx.db.insert(afterSalesTickets).values({
        id: ticketId,
        ticketNo: `AS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        productId: input.productId,
        serialNo: input.serialNo ?? null,
        issueType: input.issueType,
        description: input.description,
        status: "open",
        policyRefs: JSON.stringify(validRefs),
        resolution: null,
        createdAt: Date.now(),
      }).run();
      return { ticket: { id: ticketId, status: "open", ...preview } };
    });
    return { model: ok({ status: "committed", ticket: result.value.ticket, replayed: result.replayed }) };
  },
};
