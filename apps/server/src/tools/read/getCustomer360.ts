import { desc, eq } from "drizzle-orm";
import { GetCustomer360Input, fail, ok } from "@salespilot/shared";
import { contacts, customers, orders, quotes } from "../../db/schema.js";
import { assertCustomerAccess } from "../../domain/permissions.js";
import type { ToolDefinition } from "../types.js";

export const getCustomer360: ToolDefinition<GetCustomer360Input, unknown> = {
  name: "get_customer_360",
  description: "读取客户 360：联系人、信用额度、应收、最近订单与未结报价。",
  inputSchema: GetCustomer360Input,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const customer = ctx.db.select().from(customers).where(eq(customers.id, input.customerId)).get();
    if (!customer) return { model: fail("NOT_FOUND", "客户不存在") };
    assertCustomerAccess(ctx.actor, customer);
    const customerContacts = ctx.db.select().from(contacts).where(eq(contacts.customerId, customer.id)).all();
    const recentOrders = ctx.db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customer.id))
      .orderBy(desc(orders.createdAt))
      .limit(5)
      .all();
    const openQuotes = ctx.db.select().from(quotes).where(eq(quotes.customerId, customer.id)).all();
    const now = Date.now();
    return {
      model: ok({
        customer,
        contacts: customerContacts,
        credit: {
          limitCents: customer.creditLimitCents,
          usedCents: customer.creditUsedCents,
          availableCents: customer.creditLimitCents - customer.creditUsedCents,
          utilization: customer.creditLimitCents === 0 ? 0 : customer.creditUsedCents / customer.creditLimitCents,
        },
        recentOrders,
        openQuotes: openQuotes.filter(
          (quote) =>
            ["draft", "pending_approval", "approved"].includes(quote.status) && quote.validUntil >= now,
        ),
      }),
    };
  },
};
